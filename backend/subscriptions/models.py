"""A subscription is one basket per household, holding many product lines.

Each line carries its own rhythm (which product, how much, morning or evening,
which days). A line can be overridden on any single date, so a household can take
two litres on Sunday and none on Thursday without touching the rest of the basket.
"""

from calendar import monthrange
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.admin.panels import FieldPanel, InlinePanel
from wagtail.models import Orderable

from catalog.models import Slot


class Frequency(models.TextChoices):
    DAILY = "daily", "Every day"
    ALTERNATE = "alternate", "Every other day"
    WEEKDAYS = "weekdays", "Chosen days of the week"
    MONTHLY = "monthly", "Once a month"


def line_total(unit_price, quantity, discount_percent):
    """One line on one day, after the package discount. The roster charges this,
    so every estimate adds up the same per-line figures."""
    gross = unit_price * quantity
    if discount_percent:
        gross -= gross * discount_percent / Decimal("100")
    return gross.quantize(Decimal("0.01"))


def occurs_on(day, frequency, weekdays, anchor):
    """Does a rhythm land on this date, ignoring pauses and overrides?"""
    if frequency == Frequency.DAILY:
        return True
    if frequency == Frequency.ALTERNATE:
        return (day - anchor).days % 2 == 0
    if frequency == Frequency.WEEKDAYS:
        return day.weekday() in (weekdays or [])
    if frequency == Frequency.MONTHLY:
        # Same date each month, pulled back to the last day in shorter months
        # so a 31st subscription still arrives in February.
        return day.day == min(anchor.day, monthrange(day.year, day.month)[1])
    return False


class Package(ClusterableModel):
    """A ready-made basket the farm offers, so signing up is two taps.

    Choosing one copies its items into a normal subscription; the customer can
    then change anything. Prices stay per-item so the wallet ledger is honest,
    with an optional package discount on top.
    """

    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=True)
    tagline = models.CharField(max_length=140, blank=True)
    description = models.TextField(blank=True)
    serves = models.CharField(max_length=60, blank=True, help_text="e.g. A family of four")
    accent = models.CharField(max_length=7, default="#0E6B4B")
    discount_percent = models.DecimalField(max_digits=4, decimal_places=1, default=Decimal("0.0"))
    is_active = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)

    panels = [
        FieldPanel("name"),
        FieldPanel("slug"),
        FieldPanel("tagline"),
        FieldPanel("description"),
        FieldPanel("serves"),
        FieldPanel("accent"),
        FieldPanel("discount_percent"),
        FieldPanel("is_active"),
        FieldPanel("is_featured"),
        FieldPanel("sort_order"),
        InlinePanel("items", heading="What is in it", min_num=1),
    ]

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def monthly_estimate(self, days=30):
        """What this package costs over a month, at today's prices."""
        today = timezone.localdate()
        total = Decimal("0")
        for item in self.items.all():
            hits = sum(
                1
                for i in range(days)
                if occurs_on(today + timedelta(days=i), item.frequency, item.weekdays, today)
            )
            total += item.variant.price * item.quantity * hits
        if self.discount_percent:
            total -= total * self.discount_percent / Decimal("100")
        return total.quantize(Decimal("0.01"))


class PackageItem(Orderable):
    package = ParentalKey(Package, related_name="items", on_delete=models.CASCADE)
    variant = models.ForeignKey("catalog.ProductVariant", related_name="package_items", on_delete=models.PROTECT)
    quantity = models.PositiveSmallIntegerField(default=1)
    slot = models.CharField(max_length=10, choices=Slot.choices, default=Slot.MORNING)
    frequency = models.CharField(max_length=12, choices=Frequency.choices, default=Frequency.DAILY)
    weekdays = models.JSONField(default=list, blank=True)

    panels = [
        FieldPanel("variant"),
        FieldPanel("quantity"),
        FieldPanel("slot"),
        FieldPanel("frequency"),
        FieldPanel("weekdays"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = "package item"

    def __str__(self):
        return f"{self.variant} x {self.quantity}"


class Subscription(models.Model):
    """One household's standing order. The lines hold the detail."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        CANCELLED = "cancelled", "Cancelled"

    user = models.ForeignKey("accounts.User", related_name="subscriptions", on_delete=models.CASCADE)
    address = models.ForeignKey("accounts.Address", related_name="subscriptions", on_delete=models.RESTRICT)
    package = models.ForeignKey(
        Package, related_name="subscriptions", null=True, blank=True, on_delete=models.SET_NULL
    )
    discount_percent = models.DecimalField(max_digits=4, decimal_places=1, default=Decimal("0.0"))

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    start_date = models.DateField(default=timezone.localdate)
    resume_on = models.DateField(null=True, blank=True, help_text="Set when paused until a fixed date")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Basket for {self.user.get_short_name()}"

    def is_running_on(self, day):
        if self.status == self.Status.CANCELLED:
            return False
        if day < self.start_date:
            return False
        if self.status == self.Status.PAUSED and (self.resume_on is None or day < self.resume_on):
            return False
        return True

    @property
    def active_lines(self):
        return [line for line in self.lines.all() if line.is_active]

    def per_day_total(self, day, overrides=None):
        """What this basket costs on one date, after the package discount."""
        total = Decimal("0")
        for line in self.active_lines:
            quantity = line.quantity_on(day, overrides)
            if quantity:
                total += line_total(line.unit_price, quantity, self.discount_percent)
        return total

    def monthly_estimate(self, days=30, cached=False):
        today = timezone.localdate()
        overrides = self.override_map(cached)
        total = sum(
            (self.per_day_total(today + timedelta(days=i), overrides) for i in range(days)), Decimal("0")
        )
        return total.quantize(Decimal("0.01"))

    def override_map(self, cached=False):
        """{line_id: {date: quantity}}, read fresh — callers may have just written one.

        ``cached`` reuses ``lines__overrides`` when the queryset prefetched them,
        which the read-only API views do; writers leave it off.
        """
        if cached:
            lines = getattr(self, "_prefetched_objects_cache", {}).get("lines")
            if lines is not None and all("overrides" in getattr(l, "_prefetched_objects_cache", {}) for l in lines):
                return {
                    line.id: {o.date: o.quantity for o in line.overrides.all()}
                    for line in lines
                    if line.overrides.all()
                }
        table = {}
        for line_id, day, quantity in DayOverride.objects.filter(line__subscription=self).values_list(
            "line_id", "date", "quantity"
        ):
            table.setdefault(line_id, {})[day] = quantity
        return table

    def upcoming_dates(self, count=5, from_date=None, cached=False):
        cursor = from_date or timezone.localdate()
        overrides = self.override_map(cached)
        found, guard = [], 0
        while len(found) < count and guard < 120:
            if self.is_running_on(cursor) and any(
                line.quantity_on(cursor, overrides) for line in self.active_lines
            ):
                found.append(cursor)
            cursor += timedelta(days=1)
            guard += 1
        return found


class SubscriptionLine(models.Model):
    """One product in the basket, with its own rhythm."""

    subscription = models.ForeignKey(Subscription, related_name="lines", on_delete=models.CASCADE)
    variant = models.ForeignKey("catalog.ProductVariant", related_name="subscription_lines", on_delete=models.PROTECT)

    quantity = models.PositiveSmallIntegerField(default=1, help_text="Default packs per delivery")
    slot = models.CharField(max_length=10, choices=Slot.choices, default=Slot.MORNING)
    frequency = models.CharField(max_length=12, choices=Frequency.choices, default=Frequency.DAILY)
    weekdays = models.JSONField(default=list, blank=True, help_text="0=Monday .. 6=Sunday")

    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["slot", "id"]

    def __str__(self):
        return f"{self.variant} x {self.quantity} ({self.get_slot_display()})"

    def clean(self):
        if self.frequency == Frequency.WEEKDAYS and not self.weekdays:
            raise ValidationError({"weekdays": "Pick at least one day of the week."})
        if self.end_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date cannot be before the start date."})

    def save(self, *args, **kwargs):
        if not self.unit_price:
            self.unit_price = self.variant.price
        super().save(*args, **kwargs)

    def quantity_on(self, day, overrides=None):
        """Packs to deliver on this date. 0 means nothing goes out.

        A DayOverride wins over the rhythm, so a household can add a delivery on
        a day the rhythm skips, or cancel one it would normally get.
        """
        if not self.is_active:
            return 0
        if day < self.start_date or (self.end_date and day > self.end_date):
            return 0
        if not self.subscription.is_running_on(day):
            return 0

        if overrides is None:
            override = self.overrides.filter(date=day).first()
            if override is not None:
                return override.quantity
        else:
            table = overrides.get(self.id)
            if table and day in table:
                return table[day]

        return self.quantity if occurs_on(day, self.frequency, self.weekdays, self.start_date) else 0


class DayOverride(models.Model):
    """A one-day change of mind: a different amount, or nothing at all (0)."""

    line = models.ForeignKey(SubscriptionLine, related_name="overrides", on_delete=models.CASCADE)
    date = models.DateField()
    quantity = models.PositiveSmallIntegerField(default=0)
    note = models.CharField(max_length=140, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date"]
        constraints = [models.UniqueConstraint(fields=["line", "date"], name="unique_override_per_day")]

    def __str__(self):
        return f"{self.date}: {self.quantity or 'skip'}"
