"""Small builders shared by the test suites."""

from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal
from itertools import count
from unittest import mock
from zoneinfo import ZoneInfo

from django.utils.text import slugify
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import Address, User
from catalog.models import Category, Product, ProductVariant

FARM_TZ = ZoneInfo("Asia/Kolkata")
_phones = count(9811200001)


@contextmanager
def at(stamp):
    """Stop the clock at a farm-local moment, e.g. ``at("2026-09-10 20:30")``."""
    moment = datetime.strptime(stamp, "%Y-%m-%d %H:%M").replace(tzinfo=FARM_TZ)
    with mock.patch("django.utils.timezone.now", return_value=moment):
        yield moment


def customer(name="Test Customer"):
    phone = str(next(_phones))
    user = User.objects.create_customer(phone, full_name=name)
    address = Address.objects.create(
        user=user, contact_name=name, contact_phone=phone, line1="House 1", pincode="335804", is_default=True
    )
    return user, address


def staff(username="rider"):
    return User.objects.create_user(username, password="a-long-test-password", is_staff=True, full_name="Ravi Rider")


def variant(name="Cow Milk", price="68.00", label="1 litre", morning=True, evening=True, subscribable=True):
    category, _ = Category.objects.get_or_create(slug="milk", defaults={"name": "Milk"})
    product, _ = Product.objects.get_or_create(
        slug=slugify(name),
        defaults={
            "name": name,
            "category": category,
            "available_morning": morning,
            "available_evening": evening,
            "is_subscribable": subscribable,
        },
    )
    return ProductVariant.objects.create(product=product, label=label, price=Decimal(price))


def api(user=None):
    client = APIClient()
    if user is not None:
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
    return client
