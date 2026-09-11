import secrets
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone

from catalog.models import Slot


class Delivery(models.Model):
    """One roster line: what a rider carries to one door on one date."""

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        OUT = "out_for_delivery", "Out for delivery"
        DELIVERED = "delivered", "Delivered"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Not delivered"

    # RESTRICT: a delivery is a ledger entry, so its basket, item and address
    # cannot be deleted out from under it — only removed along with the customer.
    line = models.ForeignKey(
        "subscriptions.SubscriptionLine", related_name="deliveries", on_delete=models.RESTRICT
    )
    subscription = models.ForeignKey(
        "subscriptions.Subscription", related_name="deliveries", on_delete=models.RESTRICT
    )
    user = models.ForeignKey("accounts.User", related_name="deliveries", on_delete=models.CASCADE)
    address = models.ForeignKey("accounts.Address", related_name="deliveries", on_delete=models.RESTRICT)
    variant = models.ForeignKey("catalog.ProductVariant", related_name="deliveries", on_delete=models.PROTECT)

    date = models.DateField(db_index=True)
    slot = models.CharField(max_length=10, choices=Slot.choices)
    quantity = models.PositiveSmallIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    rider_note = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["date", "slot"]
        verbose_name_plural = "deliveries"
        constraints = [
            models.UniqueConstraint(fields=["line", "date"], name="unique_delivery_per_line_day")
        ]
        indexes = [models.Index(fields=["date", "slot", "status"])]

    def __str__(self):
        return f"{self.date} {self.get_slot_display()} — {self.variant}"

    @property
    def label(self):
        return f"{self.variant.product.name} {self.variant.label} on {self.date}"

    @transaction.atomic
    def mark_delivered(self):
        """Idempotent on purpose: this debits a wallet, and riders double-tap.

        The status flip is one conditional UPDATE, so of two simultaneous taps
        exactly one sees a row change and only that one charges.
        """
        now = timezone.now()
        claimed = (
            Delivery.objects.filter(pk=self.pk)
            .exclude(status=self.Status.DELIVERED)
            .update(status=self.Status.DELIVERED, delivered_at=now)
        )
        if not claimed:
            self.refresh_from_db(fields=["status", "delivered_at"])
            return None
        self.status, self.delivered_at = self.Status.DELIVERED, now
        return Wallet.for_user(self.user).debit(self.total, self.label, ref=str(self.pk))

    @transaction.atomic
    def set_status(self, new_status):
        """Move to any status. Taking back a delivery that was marked delivered
        refunds its charge, so a mis-tap can be undone without cost."""
        if new_status == self.Status.DELIVERED:
            return self.mark_delivered() is not None
        current = Delivery.objects.select_for_update().get(pk=self.pk)
        if current.status == new_status:
            self.status = new_status
            return False
        Delivery.objects.filter(pk=self.pk).update(status=new_status, delivered_at=None)
        if current.status == self.Status.DELIVERED:
            Wallet.for_user(self.user).credit(self.total, f"Refund: {self.label}", ref=str(self.pk))
        self.status, self.delivered_at = new_status, None
        return True


class Order(models.Model):
    """A one-off purchase that sits outside any subscription."""

    class Status(models.TextChoices):
        PLACED = "placed", "Placed"
        PACKED = "packed", "Packed"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"

    reference = models.CharField(max_length=14, unique=True, blank=True)
    user = models.ForeignKey("accounts.User", related_name="orders", on_delete=models.CASCADE)
    address = models.ForeignKey("accounts.Address", related_name="orders", on_delete=models.RESTRICT)
    delivery_date = models.DateField()
    slot = models.CharField(max_length=10, choices=Slot.choices, default=Slot.MORNING)

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    delivery_fee = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("0"))
    total = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PLACED, db_index=True)
    note = models.CharField(max_length=240, blank=True)
    placed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-placed_at"]

    def __str__(self):
        return self.reference or f"Order #{self.pk}"

    def save(self, *args, **kwargs):
        if not self.reference:
            stamp = timezone.localdate().strftime("%y%m%d")
            while True:
                reference = f"FL{stamp}{secrets.randbelow(10**6):06d}"
                if not Order.objects.filter(reference=reference).exists():
                    break
            self.reference = reference
        super().save(*args, **kwargs)

    def recalculate(self):
        self.subtotal = sum((item.total for item in self.items.all()), Decimal("0"))
        self.total = self.subtotal + self.delivery_fee
        self.save(update_fields=["subtotal", "total"])
        return self.total


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    variant = models.ForeignKey("catalog.ProductVariant", related_name="order_items", on_delete=models.PROTECT)
    quantity = models.PositiveSmallIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=8, decimal_places=2)

    def __str__(self):
        return f"{self.variant} × {self.quantity}"

    @property
    def total(self):
        return (self.unit_price * self.quantity).quantize(Decimal("0.01"))


class Wallet(models.Model):
    """Customers top up, deliveries draw down. Keeps the daily round cash-free."""

    user = models.OneToOneField("accounts.User", related_name="wallet", on_delete=models.CASCADE)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"₹{self.balance} — {self.user.phone}"

    @classmethod
    def for_user(cls, user):
        wallet, _ = cls.objects.get_or_create(user=user)
        return wallet

    @transaction.atomic
    def _move(self, kind, amount, note, ref=""):
        amount = Decimal(amount).quantize(Decimal("0.01"))
        wallet = Wallet.objects.select_for_update().get(pk=self.pk)
        wallet.balance += amount if kind == WalletTransaction.Kind.CREDIT else -amount
        wallet.save(update_fields=["balance"])
        self.balance = wallet.balance
        return WalletTransaction.objects.create(
            wallet=wallet, kind=kind, amount=amount, note=note, reference=ref, balance_after=wallet.balance
        )

    def credit(self, amount, note, ref=""):
        return self._move(WalletTransaction.Kind.CREDIT, amount, note, ref)

    def debit(self, amount, note, ref=""):
        return self._move(WalletTransaction.Kind.DEBIT, amount, note, ref)


class WalletTransaction(models.Model):
    class Kind(models.TextChoices):
        CREDIT = "credit", "Top-up"
        DEBIT = "debit", "Charge"

    wallet = models.ForeignKey(Wallet, related_name="transactions", on_delete=models.CASCADE)
    kind = models.CharField(max_length=6, choices=Kind.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.CharField(max_length=200, blank=True)
    reference = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        sign = "+" if self.kind == self.Kind.CREDIT else "−"
        return f"{sign}₹{self.amount} {self.note}"
