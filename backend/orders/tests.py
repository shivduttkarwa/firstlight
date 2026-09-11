from datetime import date
from decimal import Decimal

from django.test import TestCase, override_settings

from catalog.models import Slot
from firstlight.testing import api, at, customer, variant
from subscriptions.models import Subscription, SubscriptionLine

from .models import Delivery, Wallet, WalletTransaction


def delivery(user, address, item, day=date(2026, 9, 11), slot=Slot.MORNING, total="68.00"):
    basket, _ = Subscription.objects.get_or_create(user=user, address=address, defaults={"start_date": day})
    line = SubscriptionLine.objects.create(
        subscription=basket, variant=item, unit_price=item.price, start_date=day, slot=slot
    )
    return Delivery.objects.create(
        line=line, subscription=basket, user=user, address=address, variant=item,
        date=day, slot=slot, quantity=1, unit_price=item.price, total=Decimal(total),
    )


class ChargingTests(TestCase):
    def setUp(self):
        self.user, self.address = customer()
        self.row = delivery(self.user, self.address, variant("Cow Milk", "68.00"))
        self.wallet = Wallet.for_user(self.user)

    def balance(self):
        self.wallet.refresh_from_db()
        return self.wallet.balance

    def test_a_double_tap_charges_once(self):
        stale = Delivery.objects.get(pk=self.row.pk)
        self.assertIsNotNone(self.row.mark_delivered())
        # A second copy loaded before the first tap landed must not charge again.
        self.assertIsNone(stale.mark_delivered())
        self.assertEqual(self.balance(), Decimal("-68.00"))
        self.assertEqual(WalletTransaction.objects.count(), 1)

    def test_taking_a_delivery_back_refunds_it(self):
        self.row.set_status(Delivery.Status.DELIVERED)
        self.row.set_status(Delivery.Status.FAILED)
        self.assertEqual(self.balance(), Decimal("0.00"))
        self.row.set_status(Delivery.Status.DELIVERED)
        self.assertEqual(self.balance(), Decimal("-68.00"))
        kinds = list(WalletTransaction.objects.order_by("id").values_list("kind", flat=True))
        self.assertEqual(kinds, ["debit", "credit", "debit"])


class WalletTopUpTests(TestCase):
    def setUp(self):
        self.user, _ = customer()
        self.client = api(self.user)

    @override_settings(WALLET_SELF_TOPUP=False)
    def test_switched_off_without_a_gateway(self):
        response = self.client.post("/api/wallet/", {"amount": "500"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.client.get("/api/wallet/").data["can_top_up"])

    @override_settings(WALLET_SELF_TOPUP=True)
    def test_amounts_are_checked(self):
        for bad in ("NaN", "Infinity", "0", "0.001", "-5", "50001", "abc", ""):
            with self.subTest(amount=bad):
                self.assertEqual(self.client.post("/api/wallet/", {"amount": bad}, format="json").status_code, 400)
        ok = self.client.post("/api/wallet/", {"amount": "250.50"}, format="json")
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(Decimal(ok.data["balance"]), Decimal("250.50"))


class OrderTests(TestCase):
    def test_one_off_orders_cannot_be_placed_yet(self):
        user, address = customer()
        response = api(user).post("/api/orders/", {"address": address.pk, "items": []}, format="json")
        self.assertEqual(response.status_code, 405)


class DeliveryListTests(TestCase):
    def test_morning_comes_before_evening(self):
        user, address = customer()
        delivery(user, address, variant("Fresh Curd", "45.00", label="400 g"), slot=Slot.EVENING)
        delivery(user, address, variant("Cow Milk", "68.00"), slot=Slot.MORNING)
        with at("2026-09-10 10:00"):
            rows = api(user).get("/api/deliveries/").data
            summary = api(user).get("/api/deliveries/summary/").data
        self.assertEqual([r["slot"] for r in rows], ["morning", "evening"])
        self.assertEqual(summary["next_delivery"]["slot"], "morning")
