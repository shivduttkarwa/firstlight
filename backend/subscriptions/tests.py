from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from catalog.models import Slot
from firstlight.testing import api, at, customer, variant
from orders.models import Delivery

from .models import DayOverride, Frequency, Package, PackageItem, Subscription, SubscriptionLine, occurs_on
from .services import build_roster

# 10 September 2026 is a Thursday.
THU = date(2026, 9, 10)
FRI = date(2026, 9, 11)


def make_basket(user, address, *lines, start=THU, **extra):
    basket = Subscription.objects.create(user=user, address=address, start_date=start, **extra)
    for item, fields in lines:
        SubscriptionLine.objects.create(
            subscription=basket, variant=item, unit_price=item.price, start_date=start, **fields
        )
    return basket


class RhythmTests(SimpleTestCase):
    def test_monthly_on_the_31st_falls_back_in_short_months(self):
        anchor = date(2026, 1, 31)
        self.assertTrue(occurs_on(date(2027, 2, 28), Frequency.MONTHLY, [], anchor))
        self.assertTrue(occurs_on(date(2028, 2, 29), Frequency.MONTHLY, [], anchor))
        self.assertFalse(occurs_on(date(2028, 2, 28), Frequency.MONTHLY, [], anchor))
        self.assertTrue(occurs_on(date(2026, 4, 30), Frequency.MONTHLY, [], anchor))

    def test_alternate_days_count_from_the_start(self):
        self.assertTrue(occurs_on(date(2026, 9, 12), Frequency.ALTERNATE, [], THU))
        self.assertFalse(occurs_on(FRI, Frequency.ALTERNATE, [], THU))

    def test_weekdays(self):
        self.assertTrue(occurs_on(THU, Frequency.WEEKDAYS, [3], THU))
        self.assertFalse(occurs_on(FRI, Frequency.WEEKDAYS, [3], THU))


class RosterTests(TestCase):
    def setUp(self):
        self.user, self.address = customer()
        self.milk = variant("Cow Milk", "68.00")

    def morning_basket(self, **extra):
        return make_basket(self.user, self.address, (self.milk, {"slot": Slot.MORNING}), **extra)

    def scheduled(self):
        return Delivery.objects.filter(status=Delivery.Status.SCHEDULED)

    def test_builds_the_window_once(self):
        basket = self.morning_basket()
        with at("2026-09-10 10:00"):
            first = build_roster(subscription=basket)
            again = build_roster(subscription=basket)
        # This morning's round was packed last night, so it starts tomorrow.
        self.assertEqual(first["created"], 13)
        self.assertEqual(again["created"], 0)
        self.assertEqual(self.scheduled().order_by("date").first().date, FRI)

    def test_a_packed_round_is_left_alone(self):
        basket = self.morning_basket(start=date(2026, 9, 9))
        with at("2026-09-09 20:00"):
            build_roster(subscription=basket)
        with at("2026-09-09 21:30"):
            response = api(self.user).post(f"/api/subscriptions/{basket.pk}/pause/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        # Tomorrow morning was already packed when the pause came in.
        self.assertEqual(list(self.scheduled().values_list("date", flat=True)), [THU])

    def test_cancel_withdraws_rows_rostered_far_ahead(self):
        basket = self.morning_basket()
        with at("2026-09-09 20:00"):
            build_roster(days=40)
            # The basket starts on the 10th, the window on the 9th.
            self.assertEqual(self.scheduled().count(), 39)
            response = api(self.user).post(f"/api/subscriptions/{basket.pk}/cancel/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.scheduled().count(), 0)

    def test_a_pause_ends_by_itself(self):
        basket = self.morning_basket(status=Subscription.Status.PAUSED, resume_on=date(2026, 9, 12))
        with at("2026-09-12 10:00"):
            build_roster()
        basket.refresh_from_db()
        self.assertEqual(basket.status, Subscription.Status.ACTIVE)
        self.assertIsNone(basket.resume_on)

    def test_changing_the_pack_changes_the_price(self):
        basket = self.morning_basket()
        ghee = variant("Desi Cow Ghee", "450.00", label="500 g")
        line = basket.lines.get()
        with at("2026-09-10 10:00"):
            build_roster(subscription=basket)
            response = api(self.user).patch(f"/api/basket-lines/{line.pk}/", {"variant": ghee.pk}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        line.refresh_from_db()
        self.assertEqual(line.unit_price, Decimal("450.00"))
        self.assertEqual(set(self.scheduled().values_list("total", flat=True)), {Decimal("450.00")})

    def test_calendar_totals_match_what_is_charged(self):
        curd = variant("Fresh Curd", "45.00", label="400 g")
        chhach = variant("Chhach", "45.00", label="1 litre")
        basket = make_basket(
            self.user,
            self.address,
            (curd, {"slot": Slot.MORNING}),
            (chhach, {"slot": Slot.MORNING}),
            discount_percent=Decimal("7.5"),
        )
        with at("2026-09-10 10:00"):
            build_roster(subscription=basket)
            days = api(self.user).get(f"/api/subscriptions/{basket.pk}/calendar/").data["days"]
        friday = next(d for d in days if d["date"] == FRI.isoformat())
        charged = sum(Delivery.objects.filter(date=FRI).values_list("total", flat=True))
        self.assertEqual(Decimal(friday["total"]), charged)


class DayChangeTests(TestCase):
    def setUp(self):
        self.user, self.address = customer()
        self.milk = variant("Cow Milk", "68.00")
        self.curd = variant("Fresh Curd", "45.00", label="400 g")
        self.basket = make_basket(
            self.user,
            self.address,
            (self.milk, {"slot": Slot.MORNING}),
            (self.curd, {"slot": Slot.EVENING}),
        )
        self.morning, self.evening = self.basket.lines.order_by("slot")[1], self.basket.lines.order_by("slot")[0]
        self.client = api(self.user)

    def set_day(self, line, day, quantity):
        return self.client.post(
            f"/api/subscriptions/{self.basket.pk}/set-day/",
            {"line": line.pk, "date": day.isoformat(), "quantity": quantity},
            format="json",
        )

    def test_changes_close_at_the_cutoff(self):
        with at("2026-09-10 21:30"):
            late = self.set_day(self.morning, FRI, 0)
            fine = self.set_day(self.evening, FRI, 2)
        self.assertEqual(late.status_code, 400)
        self.assertIn("Too late", late.data["detail"])
        self.assertEqual(fine.status_code, 200)

    def test_skip_day_skips_only_the_open_rounds(self):
        with at("2026-09-10 21:30"):
            response = self.client.post(
                f"/api/subscriptions/{self.basket.pk}/skip-day/", {"date": FRI.isoformat()}, format="json"
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(DayOverride.objects.values_list("line_id", flat=True)), [self.evening.pk])

    def test_no_changes_on_a_paused_day(self):
        self.basket.status = Subscription.Status.PAUSED
        self.basket.save()
        with at("2026-09-10 10:00"):
            response = self.set_day(self.evening, FRI, 2)
        self.assertEqual(response.status_code, 400)

    def test_the_calendar_marks_packed_rounds(self):
        with at("2026-09-10 21:30"):
            days = self.client.get(f"/api/subscriptions/{self.basket.pk}/calendar/?days=3").data["days"]
        self.assertEqual(days[0]["locked"], ["morning", "evening"])
        self.assertEqual(days[1]["locked"], ["morning"])
        self.assertEqual(days[2]["locked"], [])


class LineValidationTests(TestCase):
    def setUp(self):
        self.user, self.address = customer()
        self.milk = variant("Cow Milk", "68.00")
        self.basket = make_basket(self.user, self.address)
        self.client = api(self.user)

    def add(self, **fields):
        data = {"subscription": self.basket.pk, "variant": self.milk.pk, **fields}
        with at("2026-09-10 10:00"):
            return self.client.post("/api/basket-lines/", data, format="json")

    def test_quantity_bounds(self):
        self.assertEqual(self.add(quantity=0).status_code, 400)
        self.assertEqual(self.add(quantity=21).status_code, 400)
        self.assertEqual(self.add(quantity=2).status_code, 201)

    def test_weekdays_must_be_a_list_of_days(self):
        self.assertEqual(self.add(frequency="weekdays", weekdays=5).status_code, 400)
        self.assertEqual(self.add(frequency="weekdays", weekdays=[]).status_code, 400)
        self.assertEqual(self.add(frequency="weekdays", weekdays=[7]).status_code, 400)
        self.assertEqual(self.add(frequency="weekdays", weekdays=[3, 0, 3]).data["weekdays"], [0, 3])

    def test_the_round_is_checked_even_when_not_sent(self):
        morning_only = variant("Chhach", "25.00", evening=False)
        self.milk = morning_only
        self.assertEqual(self.add(slot="evening").status_code, 400)
        self.assertEqual(self.add().status_code, 201)

    def test_products_that_cannot_be_subscribed(self):
        self.milk = variant("Paneer", "90.00", subscribable=False)
        self.assertEqual(self.add().status_code, 400)
        hidden = variant("Buffalo Ghee", "800.00")
        hidden.product.is_active = False
        hidden.product.save()
        self.milk = hidden
        self.assertEqual(self.add().status_code, 400)

    def test_dates(self):
        self.assertEqual(self.add(start_date="2026-09-01").status_code, 400)
        self.assertEqual(self.add(start_date="2026-09-12", end_date="2026-09-11").status_code, 400)


class BasketRulesTests(TestCase):
    def setUp(self):
        self.user, self.address = customer()
        self.milk = variant("Cow Milk", "68.00")
        self.client = api(self.user)

    def test_baskets_are_cancelled_not_deleted(self):
        basket = make_basket(self.user, self.address, (self.milk, {}))
        self.assertEqual(self.client.delete(f"/api/subscriptions/{basket.pk}/").status_code, 405)

    def test_removing_an_item_keeps_its_history(self):
        basket = make_basket(self.user, self.address, (self.milk, {}))
        line = basket.lines.get()
        with at("2026-09-10 10:00"):
            build_roster(subscription=basket)
            Delivery.objects.filter(date=FRI).get().mark_delivered()
            response = self.client.delete(f"/api/basket-lines/{line.pk}/")
        self.assertEqual(response.status_code, 204)
        line.refresh_from_db()
        self.assertFalse(line.is_active)
        self.assertEqual(Delivery.objects.get().status, Delivery.Status.DELIVERED)

    def test_a_package_discount_cannot_be_claimed_by_hand(self):
        package = Package.objects.create(name="Full Table", slug="full-table", discount_percent=Decimal("10"))
        with at("2026-09-10 10:00"):
            response = self.client.post(
                "/api/subscriptions/", {"address": self.address.pk, "package": package.pk}, format="json"
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Decimal(response.data["discount_percent"]), Decimal("0"))

    def test_one_basket_per_household(self):
        package = Package.objects.create(name="Just Milk", slug="just-milk", discount_percent=Decimal("4"))
        PackageItem.objects.create(package=package, variant=self.milk, quantity=1)
        old = make_basket(self.user, self.address, (self.milk, {}))
        with at("2026-09-10 10:00"):
            second = self.client.post("/api/subscriptions/", {"address": self.address.pk}, format="json")
            conflict = self.client.post(
                "/api/subscriptions/from-package/",
                {"package": "just-milk", "address": self.address.pk},
                format="json",
            )
            replaced = self.client.post(
                "/api/subscriptions/from-package/",
                {"package": "just-milk", "address": self.address.pk, "replace": True},
                format="json",
            )
        self.assertEqual(second.status_code, 400)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(replaced.status_code, 201)
        old.refresh_from_db()
        self.assertEqual(old.status, Subscription.Status.CANCELLED)

    def test_bad_calendar_length(self):
        basket = make_basket(self.user, self.address, (self.milk, {}))
        self.assertEqual(self.client.get(f"/api/subscriptions/{basket.pk}/calendar/?days=abc").status_code, 400)
