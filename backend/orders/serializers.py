from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Address
from catalog.models import ProductVariant
from catalog.serializers import rendition_url

from .models import Delivery, Order, OrderItem, Wallet, WalletTransaction


class DeliverySerializer(serializers.ModelSerializer):
    product = serializers.SerializerMethodField()
    address_summary = serializers.SerializerMethodField()
    slot_display = serializers.CharField(source="get_slot_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Delivery
        fields = [
            "id", "subscription", "line", "date", "slot", "slot_display", "quantity",
            "unit_price", "total", "status", "status_display", "delivered_at",
            "product", "address_summary",
        ]

    def get_product(self, obj):
        product = obj.variant.product
        return {
            "name": product.name,
            "slug": product.slug,
            "accent": product.accent,
            "kind": product.kind,
            "variant_label": obj.variant.label,
            "image": rendition_url(product.image, "fill-200x200|format-webp"),
        }

    def get_address_summary(self, obj):
        return f"{obj.address.line1}, {obj.address.village}"


class OrderItemSerializer(serializers.ModelSerializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.filter(is_active=True))
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    variant_label = serializers.CharField(source="variant.label", read_only=True)
    total = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "variant", "quantity", "unit_price", "total", "product_name", "variant_label"]
        read_only_fields = ["unit_price"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    address = serializers.PrimaryKeyRelatedField(queryset=Address.objects.all())
    slot_display = serializers.CharField(source="get_slot_display", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "reference", "address", "delivery_date", "slot", "slot_display",
            "subtotal", "delivery_fee", "total", "status", "note", "placed_at", "items",
        ]
        read_only_fields = ["reference", "subtotal", "delivery_fee", "total", "status", "placed_at"]

    def validate_delivery_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError("Pick today or a day after.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        address = attrs.get("address")
        if address and address.user_id != request.user.id:
            raise serializers.ValidationError({"address": "That address does not belong to you."})
        if not attrs.get("items"):
            raise serializers.ValidationError({"items": "Add at least one item."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        order = Order.objects.create(user=self.context["request"].user, **validated_data)
        for item in items:
            variant = item["variant"]
            OrderItem.objects.create(
                order=order, variant=variant, quantity=item["quantity"], unit_price=variant.price
            )
        order.recalculate()
        return order


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ["id", "kind", "amount", "balance_after", "note", "created_at"]


class WalletSerializer(serializers.ModelSerializer):
    transactions = serializers.SerializerMethodField()
    can_top_up = serializers.SerializerMethodField()

    class Meta:
        model = Wallet
        fields = ["balance", "updated_at", "transactions", "can_top_up"]

    def get_transactions(self, obj):
        return WalletTransactionSerializer(obj.transactions.all()[:20], many=True).data

    def get_can_top_up(self, obj):
        return settings.WALLET_SELF_TOPUP
