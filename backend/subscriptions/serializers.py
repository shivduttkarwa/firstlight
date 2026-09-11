from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from accounts.models import Address
from catalog.models import ProductVariant, Slot
from catalog.serializers import rendition_url
from orders.models import Delivery

from .cutoffs import locked_slots
from .models import DayOverride, Frequency, Package, PackageItem, Subscription, SubscriptionLine, line_total


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
    variant = serializers.PrimaryKeyRelatedField(
        queryset=ProductVariant.objects.filter(is_active=True, product__is_active=True).select_related("product")
    )
    quantity = serializers.IntegerField(min_value=1, max_value=20, required=False)
    weekdays = serializers.ListField(
        child=serializers.IntegerField(min_value=0, max_value=6), required=False, max_length=7
    )
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

    def _current(self, attrs, field, default=None):
        return attrs.get(field, getattr(self.instance, field, default))

    def validate(self, attrs):
        if "weekdays" in attrs:
            attrs["weekdays"] = sorted(set(attrs["weekdays"]))
        if self._current(attrs, "frequency", Frequency.DAILY) == Frequency.WEEKDAYS and not self._current(
            attrs, "weekdays", []
        ):
            raise serializers.ValidationError({"weekdays": "Pick at least one day of the week."})

        # Checked on every write, not only when a slot is sent — a create that
        # leaves the slot out still lands on the model's default round.
        variant = self._current(attrs, "variant")
        slot = self._current(attrs, "slot", Slot.MORNING)
        if variant:
            product = variant.product
            if not product.is_subscribable:
                raise serializers.ValidationError({"variant": f"{product.name} is not available on subscription."})
            if slot not in product.slots:
                raise serializers.ValidationError({"slot": f"{product.name} does not go out on that round."})

        start = self._current(attrs, "start_date") or timezone.localdate()
        end = self._current(attrs, "end_date")
        if self.instance is None and start < timezone.localdate():
            raise serializers.ValidationError({"start_date": "Start today or later."})
        if end and end < start:
            raise serializers.ValidationError({"end_date": "The last day cannot be before the first."})
        return attrs


class SubscriptionSerializer(serializers.ModelSerializer):
    address = serializers.PrimaryKeyRelatedField(queryset=Address.objects.all())
    # Set only by starting from a package, so its discount cannot be attached
    # to a basket filled with something else.
    package = serializers.PrimaryKeyRelatedField(read_only=True)
    lines = serializers.SerializerMethodField()
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

    def get_lines(self, obj):
        return SubscriptionLineSerializer(obj.active_lines, many=True, context=self.context).data

    def get_address_summary(self, obj):
        return f"{obj.address.line1}, {obj.address.village}"

    def get_monthly_estimate(self, obj):
        return str(obj.monthly_estimate(cached=True))

    def get_next_dates(self, obj):
        return [d.isoformat() for d in obj.upcoming_dates(5, cached=True)]

    def get_item_count(self, obj):
        return len(obj.active_lines)

    def validate_address(self, value):
        if value.user_id != self.context["request"].user.id:
            raise serializers.ValidationError("That address does not belong to you.")
        return value

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class BasketDaySerializer(serializers.Serializer):
    """One cell of the basket calendar: what goes out that day, per line."""

    date = serializers.DateField()
    total = serializers.CharField()
    lines = serializers.ListField()


def basket_calendar(subscription, days=30, from_date=None):
    start = from_date or timezone.localdate()
    now = timezone.now()
    overrides = subscription.override_map()

    # A packed round goes out as it was rostered, whatever the basket says now,
    # so for those slots the calendar shows the roster. Only today and tomorrow
    # morning can be packed.
    packed = {
        (row.line_id, row.date): row.quantity
        for row in Delivery.objects.filter(
            subscription=subscription, date__gte=start, date__lte=start + timedelta(days=1)
        ).exclude(status__in=[Delivery.Status.SKIPPED, Delivery.Status.FAILED])
    }
    packed_lines = {line_id for line_id, _ in packed}
    lines = [line for line in subscription.lines.all() if line.is_active or line.id in packed_lines]

    out = []
    for i in range(days):
        day = start + timedelta(days=i)
        locked = locked_slots(day, now)
        entries, total = [], Decimal("0")
        for line in lines:
            is_packed = line.slot in locked
            if is_packed:
                quantity = packed.get((line.id, day), 0)
            elif line.is_active:
                quantity = line.quantity_on(day, overrides)
            else:
                continue
            overridden = day in overrides.get(line.id, {})
            if quantity or overridden:
                entries.append(
                    {
                        "line": line.id,
                        "quantity": quantity,
                        "usual": line.quantity_on(day, {}),
                        "slot": line.slot,
                        "name": line.variant.product.name,
                        "variant_label": line.variant.label,
                        "accent": line.variant.product.accent,
                        "overridden": overridden,
                        "locked": is_packed,
                    }
                )
                if quantity:
                    total += line_total(line.unit_price, quantity, subscription.discount_percent)
        out.append(
            {
                "date": day.isoformat(),
                "total": str(total),
                "lines": entries,
                "locked": locked,
                "paused": not subscription.is_running_on(day),
            }
        )
    return out
