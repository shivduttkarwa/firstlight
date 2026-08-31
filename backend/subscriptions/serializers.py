from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from accounts.models import Address
from catalog.models import ProductVariant
from catalog.serializers import rendition_url

from .models import DayOverride, Frequency, Package, PackageItem, Subscription, SubscriptionLine


def product_brief(variant):
    product = variant.product
    return {
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "kind": product.kind,
        "animal": product.animal,
        "accent": product.accent,
        "image": rendition_url(product.image, "fill-240x240|format-webp"),
        "variant_id": variant.id,
        "variant_label": variant.label,
        "unit_price": str(variant.price),
    }


class PackageItemSerializer(serializers.ModelSerializer):
    product = serializers.SerializerMethodField()

    class Meta:
        model = PackageItem
        fields = ["id", "variant", "quantity", "slot", "frequency", "weekdays", "product"]

    def get_product(self, obj):
        return product_brief(obj.variant)


class PackageSerializer(serializers.ModelSerializer):
    items = PackageItemSerializer(many=True, read_only=True)
    monthly_estimate = serializers.SerializerMethodField()

    class Meta:
        model = Package
        fields = [
            "id", "name", "slug", "tagline", "description", "serves", "accent",
            "discount_percent", "is_featured", "items", "monthly_estimate",
        ]

    def get_monthly_estimate(self, obj):
        return str(obj.monthly_estimate())


class DayOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = DayOverride
        fields = ["id", "date", "quantity", "note"]


class SubscriptionLineSerializer(serializers.ModelSerializer):
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.filter(is_active=True))
    product = serializers.SerializerMethodField()
    overrides = DayOverrideSerializer(many=True, read_only=True)
    per_delivery = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionLine
        fields = [
            "id", "variant", "quantity", "slot", "frequency", "weekdays",
            "start_date", "end_date", "unit_price", "is_active",
            "product", "overrides", "per_delivery",
        ]
        read_only_fields = ["unit_price"]

    def get_product(self, obj):
        return product_brief(obj.variant)

    def get_per_delivery(self, obj):
        return str(obj.unit_price * obj.quantity)

    def validate(self, attrs):
        frequency = attrs.get("frequency", getattr(self.instance, "frequency", Frequency.DAILY))
        weekdays = attrs.get("weekdays", getattr(self.instance, "weekdays", []))
        if frequency == Frequency.WEEKDAYS:
            if not weekdays:
                raise serializers.ValidationError({"weekdays": "Pick at least one day of the week."})
            if any(not isinstance(d, int) or d < 0 or d > 6 for d in weekdays):
                raise serializers.ValidationError({"weekdays": "Days must be 0 (Monday) to 6 (Sunday)."})

        variant = attrs.get("variant", getattr(self.instance, "variant", None))
        slot = attrs.get("slot", getattr(self.instance, "slot", None))
        if variant and slot:
            product = variant.product
            if not product.is_subscribable:
                raise serializers.ValidationError({"variant": f"{product.name} is not available on subscription."})
            if slot not in product.slots:
                raise serializers.ValidationError({"slot": f"{product.name} does not go out on that round."})
        return attrs


class SubscriptionSerializer(serializers.ModelSerializer):
    address = serializers.PrimaryKeyRelatedField(queryset=Address.objects.all())
    package = serializers.PrimaryKeyRelatedField(
        queryset=Package.objects.filter(is_active=True), required=False, allow_null=True
    )
    lines = SubscriptionLineSerializer(many=True, read_only=True)
    address_summary = serializers.SerializerMethodField()
    package_name = serializers.CharField(source="package.name", read_only=True, default=None)
    monthly_estimate = serializers.SerializerMethodField()
    next_dates = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id", "address", "package", "package_name", "discount_percent", "status",
            "start_date", "resume_on", "lines", "address_summary", "monthly_estimate",
            "next_dates", "item_count", "created_at",
        ]
        read_only_fields = ["status", "resume_on", "discount_percent", "created_at"]

    def get_address_summary(self, obj):
        return f"{obj.address.line1}, {obj.address.village}"

    def get_monthly_estimate(self, obj):
        return str(obj.monthly_estimate())

    def get_next_dates(self, obj):
        return [d.isoformat() for d in obj.upcoming_dates(5)]

    def get_item_count(self, obj):
        return len(obj.active_lines)

    def validate_address(self, value):
        if value.user_id != self.context["request"].user.id:
            raise serializers.ValidationError("That address does not belong to you.")
        return value

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        package = validated_data.get("package")
        if package and not validated_data.get("discount_percent"):
            validated_data["discount_percent"] = package.discount_percent
        return super().create(validated_data)


class BasketDaySerializer(serializers.Serializer):
    """One cell of the basket calendar: what goes out that day, per line."""

    date = serializers.DateField()
    total = serializers.CharField()
    lines = serializers.ListField()


def basket_calendar(subscription, days=30, from_date=None):
    start = from_date or timezone.localdate()
    overrides = subscription.override_map()
    lines = subscription.active_lines
    out = []
    for i in range(days):
        day = start + timedelta(days=i)
        entries = []
        for line in lines:
            quantity = line.quantity_on(day, overrides)
            if quantity:
                entries.append(
                    {
                        "line": line.id,
                        "quantity": quantity,
                        "slot": line.slot,
                        "name": line.variant.product.name,
                        "variant_label": line.variant.label,
                        "accent": line.variant.product.accent,
                        "overridden": day in overrides.get(line.id, {}),
                    }
                )
        out.append(
            {
                "date": day.isoformat(),
                "total": str(subscription.per_day_total(day, overrides)),
                "lines": entries,
            }
        )
    return out
