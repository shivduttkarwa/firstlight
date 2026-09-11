from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.db.models import Case, Count, Sum, Value, When
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.models import Slot
from subscriptions.services import ensure_roster

from .models import Delivery, Order, Wallet
from .money import parse_amount
from .serializers import DeliverySerializer, OrderSerializer, WalletSerializer

MAX_TOPUP = Decimal("50000")


# Morning before evening; plain alphabetical order would put evening first.
SLOT_RANK = Case(When(slot=Slot.MORNING, then=Value(0)), default=Value(1))


class DeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DeliverySerializer
    pagination_class = None
    filterset_fields = ["status", "slot", "date"]

    def get_queryset(self):
        queryset = (
            Delivery.objects.filter(user=self.request.user)
            .select_related("variant__product", "variant__product__image", "address")
            .order_by("date", SLOT_RANK, "id")
        )
        params = self.request.query_params
        for key, lookup in (("from", "date__gte"), ("to", "date__lte")):
            raw = params.get(key)
            if raw:
                try:
                    queryset = queryset.filter(**{lookup: datetime.strptime(raw, "%Y-%m-%d").date()})
                except ValueError:
                    pass
        if params.get("upcoming") == "true":
            queryset = queryset.filter(date__gte=timezone.localdate(), status=Delivery.Status.SCHEDULED)
        return queryset

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Headline numbers for the account dashboard."""
        ensure_roster()
        today = timezone.localdate()
        month_start = today.replace(day=1)
        delivered = Delivery.objects.filter(
            user=request.user, status=Delivery.Status.DELIVERED, date__gte=month_start
        ).aggregate(count=Count("id"), spend=Sum("total"))
        next_up = (
            Delivery.objects.filter(user=request.user, date__gte=today, status=Delivery.Status.SCHEDULED)
            .select_related("variant__product")
            .order_by("date", SLOT_RANK, "id")
            .first()
        )
        return Response(
            {
                "delivered_this_month": delivered["count"] or 0,
                "spend_this_month": str(delivered["spend"] or Decimal("0")),
                "next_delivery": DeliverySerializer(next_up).data if next_up else None,
                "wallet_balance": str(Wallet.for_user(request.user).balance),
            }
        )


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    """One-off orders, read-only for now.

    Placing them is switched off: nothing puts an order on the round or charges
    the wallet for it yet, so an order placed here would never arrive.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    pagination_class = None

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items__variant__product")


class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(WalletSerializer(Wallet.for_user(request.user)).data)

    def post(self, request):
        """Self-service top-up, only while WALLET_SELF_TOPUP is on (demo). Replace
        the body of this with a payment gateway callback before taking real money."""
        if not settings.WALLET_SELF_TOPUP:
            return Response(
                {"detail": "Top-ups are added by the farm for now. Pay the rider or the farm, and it shows up here."},
                status=status.HTTP_403_FORBIDDEN,
            )
        amount = parse_amount(request.data.get("amount"), high=MAX_TOPUP)
        if amount is None:
            return Response(
                {"detail": f"Top up an amount between 1 and {MAX_TOPUP:,.0f}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet = Wallet.for_user(request.user)
        wallet.credit(amount, "Wallet top-up")
        return Response(WalletSerializer(wallet).data, status=status.HTTP_201_CREATED)
