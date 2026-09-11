from datetime import datetime

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from catalog.models import Slot

from .cutoffs import is_locked, too_late
from .models import DayOverride, Package, Subscription, SubscriptionLine
from .serializers import (
    PackageSerializer,
    SubscriptionLineSerializer,
    SubscriptionSerializer,
    basket_calendar,
)
from .services import build_roster, cancel_basket, resume_due, start_from_package


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def note_from(request):
    return str(request.data.get("note") or "")[:140]


class PackageViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class = PackageSerializer
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        return Package.objects.filter(is_active=True).prefetch_related("items__variant__product")


def bad(detail):
    return Response({"detail": detail}, status=status.HTTP_400_BAD_REQUEST)


ONE_BASKET = "You already have a basket. Add items to it, or cancel it before starting a new one."


class SubscriptionViewSet(viewsets.ModelViewSet):
    """A customer's basket. Lines and single-day changes hang off it.

    One basket per household, and it is never deleted — only cancelled — so
    its delivery history and wallet charges always have something to point at.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SubscriptionSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return (
            Subscription.objects.filter(user=self.request.user)
            .exclude(status=Subscription.Status.CANCELLED)
            .select_related("address", "package")
            .prefetch_related("lines__variant__product", "lines__overrides")
        )

    def list(self, request, *args, **kwargs):
        resume_due(Subscription.objects.filter(user=request.user))
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        if self.get_queryset().exists():
            raise ValidationError({"detail": ONE_BASKET})
        build_roster(subscription=serializer.save())

    def perform_update(self, serializer):
        build_roster(subscription=serializer.save())

    @action(detail=False, methods=["post"], url_path="from-package")
    def from_package(self, request):
        """Two-tap signup: copy a ready-made package into a new basket.

        ``replace: true`` cancels the basket the customer already has first.
        """
        package = get_object_or_404(Package, slug=request.data.get("package"), is_active=True)
        address = request.user.addresses.filter(pk=request.data.get("address")).first()
        if address is None:
            return bad("Choose a delivery address first.")

        start = parse_date(request.data.get("start_date")) or timezone.localdate()
        if start < timezone.localdate():
            return bad("Pick today or a day after.")

        with transaction.atomic():
            existing = list(self.get_queryset().select_for_update(of=("self",)))
            if existing and request.data.get("replace") is not True:
                return Response({"detail": ONE_BASKET, "code": "has_basket"}, status=status.HTTP_409_CONFLICT)
            for old in existing:
                cancel_basket(old)
            basket = start_from_package(request.user, address, package, start)
        return Response(self.get_serializer(basket).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def calendar(self, request, pk=None):
        basket = self.get_object()
        try:
            days = min(max(int(request.query_params.get("days", 30)), 1), 60)
        except ValueError:
            return bad("days must be a whole number.")
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
        cancel_basket(self.get_object())
        return Response({"detail": "Subscription cancelled."})

    @action(detail=True, methods=["post"], url_path="set-day")
    def set_day(self, request, pk=None):
        """Change how much of one line goes out on one date. 0 skips it.

        Send ``quantity: null`` to drop the override and fall back to the rhythm.
        """
        basket = self.get_object()
        day = parse_date(request.data.get("date"))
        if not day:
            return bad("Send a date as YYYY-MM-DD.")
        if day < timezone.localdate():
            return bad("That day has already gone.")
        if not basket.is_running_on(day):
            return bad("Your basket is paused on that day. Resume it first.")

        line = basket.lines.filter(pk=request.data.get("line"), is_active=True).first()
        if line is None:
            return bad("That item is not in this basket.")
        if is_locked(day, line.slot):
            return bad(too_late(day, line.slot))

        raw = request.data.get("quantity", None)
        with transaction.atomic():
            if raw is None:
                DayOverride.objects.filter(line=line, date=day).delete()
            else:
                try:
                    quantity = int(raw)
                except (TypeError, ValueError):
                    return bad("Quantity must be a whole number.")
                if quantity < 0 or quantity > 20:
                    return bad("Choose between 0 and 20.")
                DayOverride.objects.update_or_create(
                    line=line, date=day, defaults={"quantity": quantity, "note": note_from(request)}
                )
            build_roster(subscription=basket)
        return Response({"days": basket_calendar(basket, 30)})

    @action(detail=True, methods=["post"], url_path="skip-day")
    def skip_day(self, request, pk=None):
        """Skip every line on one date — the rounds that are still open."""
        basket = self.get_object()
        day = parse_date(request.data.get("date"))
        if not day or day < timezone.localdate():
            return bad("Pick today or a day after.")
        lines = [line for line in basket.active_lines if not is_locked(day, line.slot)]
        if not lines:
            slot = basket.active_lines[0].slot if basket.active_lines else Slot.MORNING
            return bad(too_late(day, slot))
        with transaction.atomic():
            for line in lines:
                DayOverride.objects.update_or_create(
                    line=line, date=day, defaults={"quantity": 0, "note": note_from(request)}
                )
            build_roster(subscription=basket)
        return Response({"days": basket_calendar(basket, 30)})


class SubscriptionLineViewSet(viewsets.ModelViewSet):
    """Items inside a basket."""

    permission_classes = [IsAuthenticated]
    serializer_class = SubscriptionLineSerializer
    pagination_class = None

    def get_queryset(self):
        return SubscriptionLine.objects.filter(
            subscription__user=self.request.user, is_active=True
        ).select_related("variant__product", "subscription")

    def get_basket(self):
        basket = (
            Subscription.objects.filter(user=self.request.user, pk=self.request.data.get("subscription"))
            .exclude(status=Subscription.Status.CANCELLED)
            .first()
        )
        if basket is None:
            raise ValueError("basket")
        return basket

    @transaction.atomic
    def perform_create(self, serializer):
        try:
            basket = self.get_basket()
        except ValueError:
            raise ValidationError({"subscription": "That basket does not belong to you."})
        line = serializer.save(subscription=basket, unit_price=serializer.validated_data["variant"].price)
        build_roster(subscription=basket)
        return line

    @transaction.atomic
    def perform_update(self, serializer):
        variant = serializer.validated_data.get("variant")
        extra = {}
        if variant is not None and variant.pk != serializer.instance.variant_id:
            # A different pack is a different price. Keeping the old one would
            # deliver ghee at the price of a glass of chhach.
            extra["unit_price"] = variant.price
        line = serializer.save(**extra)
        build_roster(subscription=line.subscription)

    @transaction.atomic
    def perform_destroy(self, instance):
        """Retire the line rather than delete it: past deliveries and their
        wallet charges keep pointing at it."""
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        build_roster(subscription=instance.subscription)
