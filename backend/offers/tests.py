from datetime import date
from decimal import Decimal

from django.test import TestCase

from firstlight.testing import api, at, customer, variant
from orders.models import Wallet
from orders.tests import delivery
from subscriptions.models import Subscription, SubscriptionLine

from .models import Coupon
from .services import OfferError, redeem


def basket(user, address, item, start=date(2026, 9, 10)):
    subscription = Subscription.objects.create(user=user, address=address, start_date=start)
    SubscriptionLine.objects.create(subscription=subscription, variant=item, unit_price=item.price, start_date=start)
    return subscription


def balance(user):
    return Wallet.for_user(user).balance


class CouponTests(TestCase):
    def setUp(self):
        self.user, self.address = customer()
        self.milk = variant("Cow Milk", "68.00")

    def test_a_percent_code_credits_part_of_the_first_month(self):
        Coupon.objects.create(
            code="firstlight20",
            title="A fifth of month one",
            kind=Coupon.Kind.PERCENT_OF_MONTH,
            value=Decimal("20"),
            new_customers_only=True,
        )
        with at("2026-09-10 10:00"):
            basket(self.user, self.address, self.milk)
            redemption = redeem(self.user, " FirstLight20 ")
        # Thirty mornings at ₹68 is ₹2,040.
        self.assertEqual(redemption.amount, Decimal("408.00"))
        self.assertEqual(balance(self.user), Decimal("408.00"))

    def test_a_code_works_once_per_household(self):
        Coupon.objects.create(code="WELCOME", title="Welcome", value=Decimal("100"))
        redeem(self.user, "WELCOME")
        with self.assertRaisesMessage(OfferError, "already used"):
            redeem(self.user, "welcome")
        self.assertEqual(balance(self.user), Decimal("100.00"))

    def test_new_household_codes_refuse_a_household_that_has_had_milk(self):
        Coupon.objects.create(code="NEWBIE", title="New", value=Decimal("50"), new_customers_only=True)
        delivery(self.user, self.address, self.milk).mark_delivered()
        with self.assertRaisesMessage(OfferError, "new to Firstlight"):
            redeem(self.user, "NEWBIE")

    def test_a_pack_code_needs_a_big_enough_basket(self):
        ghee = variant("Desi Cow Ghee", "450.00", label="250 g")
        Coupon.objects.create(
            code="GHEEFREE", title="A jar of ghee", kind=Coupon.Kind.PACK, variant=ghee, min_monthly=Decimal("2000")
        )
        small, small_address = customer()
        with at("2026-09-10 10:00"):
            with self.assertRaisesMessage(OfferError, "Start a basket first"):
                redeem(self.user, "GHEEFREE")
            basket(small, small_address, variant("Chhach", "25.00", label="500 ml"))
            with self.assertRaisesMessage(OfferError, "needs a basket of ₹2,000 a month"):
                redeem(small, "GHEEFREE")
            basket(self.user, self.address, self.milk)
            self.assertEqual(redeem(self.user, "GHEEFREE").amount, Decimal("450.00"))

    def test_ended_and_unknown_codes_are_refused(self):
        Coupon.objects.create(code="OLD", title="Old", value=Decimal("50"), ends_on=date(2026, 9, 1))
        with at("2026-09-10 10:00"), self.assertRaisesMessage(OfferError, "has ended"):
            redeem(self.user, "OLD")
        with self.assertRaisesMessage(OfferError, "isn't one of ours"):
            redeem(self.user, "NOPE")
        self.assertEqual(balance(self.user), Decimal("0.00"))


class ReferralTests(TestCase):
    def setUp(self):
        self.neighbour, _ = customer("Asha Neighbour")
        self.user, self.address = customer()
        self.milk = variant()

    def test_the_referrer_is_paid_once_after_the_first_delivery(self):
        redeem(self.user, self.neighbour.referral_code.lower())
        self.assertEqual(balance(self.user), Decimal("200.00"))
        self.assertEqual(balance(self.neighbour), Decimal("0.00"))

        delivery(self.user, self.address, self.milk).mark_delivered()
        self.assertEqual(balance(self.neighbour), Decimal("200.00"))

        delivery(self.user, self.address, self.milk, day=date(2026, 9, 12)).mark_delivered()
        self.assertEqual(balance(self.neighbour), Decimal("200.00"))

    def test_own_code_and_a_second_referral_are_refused(self):
        with self.assertRaisesMessage(OfferError, "your own code"):
            redeem(self.user, self.user.referral_code)
        redeem(self.user, self.neighbour.referral_code)
        other, _ = customer()
        with self.assertRaisesMessage(OfferError, "already joined"):
            redeem(self.user, other.referral_code)


class RedeemApiTests(TestCase):
    def test_redeeming_returns_the_new_balance(self):
        user, _ = customer()
        Coupon.objects.create(code="WELCOME", title="Welcome", value=Decimal("100"))
        response = api(user).post("/api/offers/redeem/", {"code": "welcome"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["balance"], "100.00")

        again = api(user).post("/api/offers/redeem/", {"code": "welcome"}, format="json")
        self.assertEqual(again.status_code, 400)
        self.assertIn("already used", again.json()["detail"])

    def test_needs_a_customer_login(self):
        self.assertEqual(api().post("/api/offers/redeem/", {"code": "WELCOME"}, format="json").status_code, 401)
