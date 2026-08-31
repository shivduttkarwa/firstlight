from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Delivery, Order, Wallet
from .serializers import DeliverySerializer, OrderSerializer, WalletSerializer

MAX_TOPUP = Decimal("50000")


class DeliveryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DeliverySerializer
    pagination_class = None
    filterset_fields = ["status", "slot", "date"]

    def get_queryset(self):
        queryset = Delivery.objects.filter(user=self.request.user).select_related(
            "variant__product", "variant__product__image", "address"
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
        today = timezone.localdate()
        month_start = today.replace(day=1)
        delivered = Delivery.objects.filter(
            user=request.user, status=Delivery.Status.DELIVERED, date__gte=month_start
        ).aggregate(count=Count("id"), spend=Sum("total"))
        next_up = (
            Delivery.objects.filter(user=request.user, date__gte=today, status=Delivery.Status.SCHEDULED)
            .select_related("variant__product")
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


class OrderViewSet(
    mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    permission_classes = [IsAuthenticated]
    serializer_class = OrderSerializer
    pagination_class = None

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items__variant__product")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status not in (Order.Status.PLACED, Order.Status.PACKED):
            return Response(
                {"detail": "This order can no longer be cancelled."}, status=status.HTTP_400_BAD_REQUEST
            )
        order.status = Order.Status.CANCELLED
        order.save(update_fields=["status"])
        return Response({"detail": "Order cancelled."})


class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(WalletSerializer(Wallet.for_user(request.user)).data)

    def post(self, request):
        """Dev top-up. Replace the body of this with a payment gateway callback."""
        try:
            amount = Decimal(str(request.data.get("amount", "0")))
        except (InvalidOperation, TypeError):
            return Response({"detail": "Send a numeric amount."}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0 or amount > MAX_TOPUP:
            return Response(
                {"detail": f"Top up an amount between 1 and {MAX_TOPUP:,.0f}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet = Wallet.for_user(request.user)
        wallet.credit(amount, "Wallet top-up")
        return Response(WalletSerializer(wallet).data, status=status.HTTP_201_CREATED)
