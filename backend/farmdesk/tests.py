import shutil
import tempfile
from datetime import date
from decimal import Decimal
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image as PILImage

from accounts.models import User
from catalog.models import Category, Product, ProductVariant, Slot
from firstlight.testing import api, at, customer, staff, variant
from orders.models import Delivery, Wallet
from orders.tests import delivery
from subscriptions.models import Subscription

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


def paneer(**changes):
    return {
        "name": "Fresh Paneer",
        "kind": "Paneer",
        "animal": "buffalo",
        "tagline": "Pressed the same morning",
        "available_morning": True,
        "available_evening": False,
        "variants": [{"label": "200 g", "price": "90"}, {"label": "500 g", "price": "210", "compare_at_price": "220"}],
        **changes,
    }


def png():
    buffer = BytesIO()
    PILImage.new("RGB", (40, 30), "#C6F24B").save(buffer, "PNG")
    return SimpleUploadedFile("paneer.png", buffer.getvalue(), content_type="image/png")


class ProductEditorTests(TestCase):
    def setUp(self):
        self.desk = api(staff())

    def add(self, **changes):
        return self.desk.post("/api/farm/products/", paneer(**changes), format="json")

    def test_the_farm_adds_a_new_type_of_product(self):
        user, _ = customer()
        self.assertEqual(api(user).post("/api/farm/products/", paneer(), format="json").status_code, 403)

        made = self.add()
        self.assertEqual(made.status_code, 201, made.data)
        product = Product.objects.get(slug="fresh-paneer")
        self.assertEqual((product.kind, product.category.name), ("paneer", "Paneer"))
        self.assertEqual([v.label for v in product.variants.all()], ["200 g", "500 g"])
        self.assertIn("fresh-paneer", [p["slug"] for p in api().get("/api/products/").data])

        self.assertEqual(self.add().data["slug"], "fresh-paneer-2")
        self.assertEqual(Category.objects.filter(name="Paneer").count(), 1)

    def test_a_product_needs_a_pack_size_and_a_round(self):
        hidden = self.add(variants=[{"label": "200 g", "price": "90", "is_active": False}])
        self.assertEqual(hidden.status_code, 400)
        self.assertIn("pack size", hidden.data["detail"])
        self.assertIn("round", self.add(available_morning=False).data["detail"])
        priced = self.add(variants=[{"label": "200 g", "price": "90"}, {"label": "500 g", "price": "free"}])
        self.assertTrue(priced.data["detail"].startswith("Pack size 2:"), priced.data)
        self.assertFalse(Product.objects.exists())

    def test_packs_in_use_are_hidden_never_renamed_or_deleted(self):
        milk = variant("Cow Milk", "68.00")
        spare = ProductVariant.objects.create(product=milk.product, label="2 litre", price=Decimal("132"))
        user, address = customer()
        line = Subscription.objects.create(user=user, address=address).lines.create(variant=milk, unit_price=milk.price)
        url = f"/api/farm/products/{milk.product.slug}/"
        listed = self.desk.get(url).data["variants"]
        self.assertEqual({v["label"]: v["in_use"] for v in listed}, {"1 litre": True, "2 litre": False})

        form = {"name": "Cow Milk", "kind": "milk"}
        renamed = self.desk.put(url, {**form, "variants": [{"id": milk.pk, "label": "1 L", "price": "68"}]}, format="json")
        self.assertEqual(renamed.status_code, 400)

        cheaper = self.desk.put(url, {**form, "variants": [{"id": milk.pk, "label": "1 litre", "price": "60"}]}, format="json")
        self.assertEqual(cheaper.status_code, 200, cheaper.data)
        self.assertFalse(ProductVariant.objects.filter(pk=spare.pk).exists())
        line.refresh_from_db()
        self.assertEqual(line.unit_price, Decimal("68.00"))

        self.desk.put(url, {**form, "variants": [{"label": "500 ml", "price": "36"}]}, format="json")
        milk.refresh_from_db()
        self.assertEqual((milk.is_active, milk.price), (False, Decimal("60.00")))
        self.assertEqual(list(milk.product.variants.filter(is_active=True).values_list("label", flat=True)), ["500 ml"])

    def test_photos_are_checked_before_they_go_up(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        with self.settings(MEDIA_ROOT=media):
            slug = self.add().data["slug"]
            url = f"/api/farm/products/{slug}/photo/"
            junk = SimpleUploadedFile("notes.png", b"not a photo", content_type="image/png")
            self.assertEqual(self.desk.post(url, {"photo": junk}, format="multipart").status_code, 400)

            shown = self.desk.post(url, {"photo": png()}, format="multipart")
            self.assertEqual(shown.status_code, 200, shown.data)
            self.assertTrue(shown.data["image"])
            self.assertTrue(Product.objects.get(slug=slug).image.file.name.endswith(".png"))
            self.assertIsNone(self.desk.delete(url).data["image"])
