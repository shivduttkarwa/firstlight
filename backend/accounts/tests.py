from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings

from firstlight.testing import api, at, customer, staff
from subscriptions.models import Subscription

from .models import OneTimeCode, User, normalise_phone

OTP = override_settings(OTP_SHOW_CODE=True, OTP_CODES_PER_HOUR=5, OTP_FAILURES_PER_DAY=15)


class PhoneTests(SimpleTestCase):
    def test_accepted_forms(self):
        for raw in ("9876543210", "98765 43210", "+91 98765-43210", "919876543210", "09876543210"):
            with self.subTest(raw=raw):
                self.assertEqual(normalise_phone(raw), "9876543210")

    def test_never_trimmed_into_someone_else(self):
        for raw in ("+91 98765 43210 ext 99", "91987654321", "1234567890", "९८७६५४३२१०", "98765"):
            with self.subTest(raw=raw):
                self.assertEqual(normalise_phone(raw), "")


@OTP
class CodeTests(TestCase):
    phone = "9811300001"

    def setUp(self):
        cache.clear()
        self.client = api()

    def ask(self):
        return self.client.post("/api/auth/otp/request/", {"phone": self.phone}, format="json")

    def verify(self, code):
        return self.client.post("/api/auth/otp/verify/", {"phone": self.phone, "code": code}, format="json")

    def test_a_right_code_signs_in_once(self):
        code = self.ask().data["dev_code"]
        self.assertEqual(self.verify(code).status_code, 200)
        self.assertEqual(self.verify(code).status_code, 400)

    def test_five_wrong_codes_and_the_code_is_dead(self):
        code = self.ask().data["dev_code"]
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(5):
            self.verify(wrong)
        self.assertEqual(self.verify(code).status_code, 400)

    def test_codes_per_hour_are_capped(self):
        for minute in range(5):
            with at(f"2026-09-10 10:{minute * 2:02d}"):
                self.assertEqual(self.ask().status_code, 200)
        with at("2026-09-10 10:12"):
            self.assertEqual(self.ask().status_code, 429)

    def test_too_many_wrong_codes_locks_the_number_for_a_day(self):
        for minute in range(3):
            with at(f"2026-09-10 10:{minute * 2:02d}"):
                self.ask()
        # Three codes, each guessed wrong five times: 15 misses in a day.
        OneTimeCode.objects.update(attempts=5)
        with at("2026-09-10 10:30"):
            self.assertEqual(self.ask().status_code, 429)
            self.assertEqual(self.verify("123456").status_code, 429)

    @override_settings(OTP_SHOW_CODE=False)
    def test_the_code_is_only_shown_when_asked_for(self):
        self.assertNotIn("dev_code", self.ask().data)

    def test_switched_off_accounts_cannot_sign_in(self):
        User.objects.create_customer(self.phone, is_active=False)
        code = self.ask().data["dev_code"]
        self.assertEqual(self.verify(code).status_code, 403)

    def test_staff_numbers_use_the_staff_login(self):
        User.objects.create_user("office", password="a-long-test-password", phone=self.phone, is_staff=True)
        code = self.ask().data["dev_code"]
        self.assertEqual(self.verify(code).status_code, 403)


class SessionTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_logout_retires_the_refresh_token(self):
        user = staff()
        tokens = api().post(
            "/api/auth/staff/login/", {"username": "rider", "password": "a-long-test-password"}, format="json"
        ).data["tokens"]
        self.assertEqual(api().post("/api/auth/logout/", {"refresh": tokens["refresh"]}, format="json").status_code, 204)
        again = api().post("/api/auth/refresh/", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(again.status_code, 401)
        self.assertTrue(user.is_staff)

    def test_an_address_in_use_is_not_deleted(self):
        user, address = customer()
        Subscription.objects.create(user=user, address=address)
        response = api(user).delete(f"/api/addresses/{address.pk}/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("basket", response.data["detail"])

    def test_customers_see_only_their_own_things(self):
        owner, address = customer()
        other, _ = customer("Someone Else")
        self.assertEqual(api(other).get(f"/api/addresses/{address.pk}/").status_code, 404)
        basket = Subscription.objects.create(user=owner, address=address)
        self.assertEqual(api(other).get(f"/api/subscriptions/{basket.pk}/").status_code, 404)
