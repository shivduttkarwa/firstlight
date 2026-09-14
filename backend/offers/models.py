from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


def normalise_code(raw):
    return "".join(str(raw or "").split()).upper()


class Coupon(models.Model):
    """A code a household types once, for credit in its wallet."""

    class Kind(models.TextChoices):
        PERCENT_OF_MONTH = "percent_month", "Per cent of the basket's month"
        FIXED = "fixed", "Fixed amount"
        PACK = "pack", "Price of one pack"

    code = models.CharField(max_length=20, unique=True, help_text="What customers type, e.g. FIRSTLIGHT20")
    title = models.CharField(max_length=120, help_text="Shown in the wallet next to the credit")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.FIXED)
    value = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("0"),
        help_text="Per cent for 'per cent of the basket's month', rupees for 'fixed amount'",
    )
    variant = models.ForeignKey(
        "catalog.ProductVariant",
        null=True,
        blank=True,
        related_name="coupons",
        on_delete=models.PROTECT,
        help_text="For 'price of one pack': the pack whose price is credited",
    )
    max_credit = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, help_text="The most one household can get"
    )
    min_monthly = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal("0"),
        help_text="The basket must come to at least this much a month",
    )
    new_customers_only = models.BooleanField(default=False, help_text="Only households yet to get a delivery")
    is_active = models.BooleanField(default=True)
    ends_on = models.DateField(null=True, blank=True, help_text="The last day the code works")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code

    def clean(self):
        self.code = normalise_code(self.code)
        if self.kind == self.Kind.PACK and not self.variant:
            raise ValidationError({"variant": "Pick the pack whose price is credited."})
        if self.kind == self.Kind.PERCENT_OF_MONTH and not Decimal("0") < self.value <= Decimal("100"):
            raise ValidationError({"value": "Give a per cent between 1 and 100."})
        if self.kind == self.Kind.FIXED and self.value <= 0:
            raise ValidationError({"value": "Credit more than ₹0."})

    def save(self, *args, **kwargs):
        self.code = normalise_code(self.code)
        super().save(*args, **kwargs)


class Redemption(models.Model):
    """One code used by one household, and the credit it brought."""

    user = models.ForeignKey("accounts.User", related_name="redemptions", on_delete=models.CASCADE)
    coupon = models.ForeignKey(
        Coupon, null=True, blank=True, related_name="redemptions", on_delete=models.PROTECT
    )
    is_referral = models.BooleanField(default=False)
    referrer = models.ForeignKey(
        "accounts.User", null=True, blank=True, related_name="referrals", on_delete=models.SET_NULL
    )
    code = models.CharField(max_length=20)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    referrer_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    referrer_paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "coupon"], condition=Q(coupon__isnull=False), name="one_use_of_a_code_per_customer"
            ),
            models.UniqueConstraint(
                fields=["user"], condition=Q(is_referral=True), name="one_referral_per_customer"
            ),
        ]

    def __str__(self):
        return f"{self.code} — {self.user}"
