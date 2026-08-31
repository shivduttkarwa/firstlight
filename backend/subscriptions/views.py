from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import DayOverride, Package, Subscription, SubscriptionLine
from .serializers import (
    PackageSerializer,
    SubscriptionLineSerializer,
    SubscriptionSerializer,
    basket_calendar,
)
from .services import build_roster, start_from_package


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


class PackageViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class = PackageSerializer
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        return Package.objects.filter(is_active=True).prefetch_related("items__variant__product")


class SubscriptionViewSet(viewsets.ModelViewSet):
    """A customer's basket. Lines and single-day changes hang off it."""

    permission_classes = [IsAuthenticated]
    serializer_class = SubscriptionSerializer
    pagination_class = None

    def get_queryset(self):
        return (
            Subscription.objects.filter(user=self.request.user)
            .exclude(status=Subscription.Status.CANCELLED)
            .select_related("address", "package")
            .prefetch_related("lines__variant__product", "lines__overrides")
        )

    def perform_create(self, serializer):
        build_roster(subscription=serializer.save())

    def perform_update(self, serializer):
        build_roster(subscription=serializer.save())

    @action(detail=False, methods=["post"], url_path="from-package")
    def from_package(self, request):
        """Two-tap signup: copy a ready-made package into a new basket."""
        package = get_object_or_404(Package, slug=request.data.get("package"), is_active=True)
        address = request.user.addresses.filter(pk=request.data.get("address")).first()
        if address is None:
            return Response({"detail": "Choose a delivery address first."}, status=status.HTTP_400_BAD_REQUEST)

        start = parse_date(request.data.get("start_date")) or timezone.localdate()
        if start < timezone.localdate():
            return Response({"detail": "Pick today or a day after."}, status=status.HTTP_400_BAD_REQUEST)

        basket = start_from_package(request.user, address, package, start)
        return Response(self.get_serializer(basket).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):
        basket = self.get_object()
        days = min(int(request.query_params.get("days", 30)), 60)
        return Response({"days": basket_calendar(basket, days)})

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        basket = self.get_object()
        resume_on = parse_date(request.data.get("resume_on"))
        if resume_on and resume_on <= timezone.localdate():
            return Response({"detail": "Pick a resume date in the future."}, status=status.HTTP_400_BAD_REQUEST)
        basket.status = Subscription.Status.PAUSED
        basket.resume_on = resume_on
        basket.save(update_fields=["status", "resume_on"])
        build_roster(subscription=basket)
        return Response(self.get_serializer(basket).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        basket = self.get_object()
        basket.status = Subscription.Status.ACTIVE
        basket.resume_on = None
        basket.save(update_fields=["status", "resume_on"])
        build_roster(subscription=basket)
        return Response(self.get_serializer(basket).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        basket = self.get_object()
        basket.status = Subscription.Status.CANCELLED
        basket.cancelled_at = timezone.now()
        basket.save(update_fields=["status", "cancelled_at"])
        build_roster(subscription=basket)
        return Response({"detail": "Subscription cancelled."})

    @action(detail=True, methods=["post"], url_path="set-day")
    def set_day(self, request, pk=None):
        """Change how much of one line goes out on one date. 0 skips it.

        Send ``quantity: null`` to drop the override and fall back to the rhythm.
        """
        basket = self.get_object()
        day = parse_date(request.data.get("date"))
        if not day:
            return Response({"detail": "Send a date as YYYY-MM-DD."}, status=status.HTTP_400_BAD_REQUEST)
        if day < timezone.localdate():
            return Response({"detail": "That day has already gone."}, status=status.HTTP_400_BAD_REQUEST)

        line = basket.lines.filter(pk=request.data.get("line")).first()
        if line is None:
            return Response({"detail": "That item is not in this basket."}, status=status.HTTP_400_BAD_REQUEST)

        raw = request.data.get("quantity", None)
        if raw is None:
            DayOverride.objects.filter(line=line, date=day).delete()
        else:
            try:
                quantity = int(raw)
            except (TypeError, ValueError):
                return Response({"detail": "Quantity must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
            if quantity < 0 or quantity > 20:
                return Response({"detail": "Choose between 0 and 20."}, status=status.HTTP_400_BAD_REQUEST)
            DayOverride.objects.update_or_create(
                line=line, date=day, defaults={"quantity": quantity, "note": request.data.get("note", "")}
            )

        build_roster(subscription=basket)
        return Response({"days": basket_calendar(basket, 30)})

    @action(detail=True, methods=["post"], url_path="skip-day")
    def skip_day(self, request, pk=None):
        """Skip every line on one date."""
        basket = self.get_object()
        day = parse_date(request.data.get("date"))
        if not day or day < timezone.localdate():
            return Response({"detail": "Pick today or a day after."}, status=status.HTTP_400_BAD_REQUEST)
        for line in basket.active_lines:
            DayOverride.objects.update_or_create(
                line=line, date=day, defaults={"quantity": 0, "note": request.data.get("note", "")}
            )
        build_roster(subscription=basket)
        return Response({"days": basket_calendar(basket, 30)})


class SubscriptionLineViewSet(viewsets.ModelViewSet):
    """Items inside a basket."""

    permission_classes = [IsAuthenticated]
    serializer_class = SubscriptionLineSerializer
    pagination_class = None

    def get_queryset(self):
        return SubscriptionLine.objects.filter(subscription__user=self.request.user).select_related(
            "variant__product", "subscription"
        )

    def get_basket(self):
        basket = Subscription.objects.filter(
            user=self.request.user, pk=self.request.data.get("subscription")
        ).first()
        if basket is None:
            raise ValueError("basket")
        return basket

    def perform_create(self, serializer):
        try:
            basket = self.get_basket()
        except ValueError:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"subscription": "That basket does not belong to you."})
        line = serializer.save(subscription=basket, unit_price=serializer.validated_data["variant"].price)
        build_roster(subscription=basket)
        return line

    def perform_update(self, serializer):
        line = serializer.save()
        build_roster(subscription=line.subscription)

    def perform_destroy(self, instance):
        basket = instance.subscription
        instance.delete()
        build_roster(subscription=basket)
