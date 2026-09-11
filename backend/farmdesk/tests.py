from datetime import date
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase, override_settings

from accounts.models import User
from catalog.models import Slot
from firstlight.testing import api, at, customer, staff, variant
from orders.models import Delivery, Wallet
from orders.tests import delivery

DAY = date(2026, 9, 11)


class FarmDeskTests(TestCase):
    def setUp(self):
        cache.clear()
        self.rider = staff()
        self.desk = api(self.rider)
        self.user, self.address = customer()
        self.milk = delivery(self.user, self.address, variant("Cow Milk", "68.00"), day=DAY)
        self.curd = delivery(self.user, self.address, variant("Fresh Curd", "45.00", label="400 g"), day=DAY, total="45.00")

    def mark_stop(self, status):
        return self.desk.post(
            "/api/farm/round/mark/",
            {"address": self.address.pk, "date": DAY.isoformat(), "slot": Slot.MORNING, "status": status},
            format="json",
        )

    def test_customers_are_kept_out(self):
        self.assertEqual(api(self.user).get("/api/farm/overview/").status_code, 403)
        self.assertEqual(api().get("/api/farm/round/").status_code, 401)

    def test_a_whole_stop_only_moves_what_is_open(self):
        self.curd.set_status(Delivery.Status.FAILED)
        self.assertEqual(self.mark_stop("delivered").data["changed"], 1)
        self.assertEqual(self.mark_stop("delivered").data["changed"], 0)
        self.curd.refresh_from_db()
        self.assertEqual(self.curd.status, Delivery.Status.FAILED)
        self.assertEqual(Wallet.for_user(self.user).balance, Decimal("-68.00"))

    def test_round_counts_what_is_left(self):
        # ₹100 covers the milk; once it is delivered nothing is left to charge,
        # so the stop is not "low" just because the day's total was over 100.
        Wallet.for_user(self.user).credit(Decimal("100"), "Cash")
        self.curd.set_status(Delivery.Status.FAILED)
        self.milk.set_status(Delivery.Status.DELIVERED)
        with at("2026-09-11 09:00"):
            totals = self.desk.get(f"/api/farm/round/?date={DAY}&slot=morning").data
        self.assertEqual(totals["totals"]["pending"], 0)
        self.assertFalse(totals["stops"][0]["wallet_low"])

    def test_top_ups_are_checked_and_signed(self):
        url = f"/api/farm/customers/{self.user.pk}/topup/"
        self.assertEqual(self.desk.post(url, {"amount": "NaN"}, format="json").status_code, 400)
        self.assertEqual(self.desk.post(url, {"amount": "0.001"}, format="json").status_code, 400)
        self.assertEqual(self.desk.post(url, {"amount": "500", "note": "Cash"}, format="json").status_code, 200)
        note = Wallet.for_user(self.user).transactions.get().note
        self.assertIn("Cash", note)
        self.assertIn("Ravi", note)

    def test_bad_roster_length(self):
        self.assertEqual(self.desk.post("/api/farm/roster/rebuild/", {"days": "abc"}, format="json").status_code, 400)

    @override_settings(
        STORAGES={
            "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
            "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        }
    )
    def test_deliveries_are_read_only_in_the_admin(self):
        admin = User.objects.create_superuser("boss", password="a-long-test-password")
        self.client.force_login(admin)
        edit = self.client.get(f"/admin/snippets/orders/delivery/edit/{self.milk.pk}/")
        self.assertNotEqual(edit.status_code, 200)
        self.assertEqual(self.client.get(f"/admin/snippets/orders/delivery/inspect/{self.milk.pk}/").status_code, 200)
