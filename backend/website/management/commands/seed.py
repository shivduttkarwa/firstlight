"""Populate a fresh database with the farm's real catalogue and storefront copy."""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from wagtail.models import Page, Site

from catalog.models import Category, Product, ProductVariant
from subscriptions.models import Frequency, Package, PackageItem
from website.models import HomePage

CATEGORIES = [
    ("Milk", "milk", "Drawn twice a day, never stored overnight", 1),
    ("Ghee", "ghee", "Slow bilona ghee from our own cream", 2),
    ("Curd & Chhach", "curd-chhach", "Set fresh, sold the same morning", 3),
]

PRODUCTS = [
    {
        "name": "Cow Milk",
        "slug": "cow-milk",
        "category": "milk",
        "kind": Product.Kind.MILK,
        "animal": Product.Animal.COW,
        "tagline": "Light, sweet and easy on the stomach",
        "badge": "Everyday favourite",
        "fat_percent": Decimal("4.0"),
        "snf_percent": Decimal("8.5"),
        "shelf_life": "Same day",
        "accent": "#C6F24B",
        "description": "<p>From our desi cows, milked at 4.30 in the morning and again at 4.30 in "
        "the evening. It reaches you within ninety minutes of leaving the animal &mdash; unhomogenised, "
        "unstandardised, nothing taken out and nothing put in.</p>",
        "sort_order": 1,
        "variants": [("500 ml", "0.5", "ml", "35.00", None), ("1 litre", "1", "L", "68.00", "70.00"), ("2 litre", "2", "L", "132.00", "140.00")],
    },
    {
        "name": "Buffalo Milk",
        "slug": "buffalo-milk",
        "category": "milk",
        "kind": Product.Kind.MILK,
        "animal": Product.Animal.BUFFALO,
        "tagline": "Thick, creamy, the one that makes real malai",
        "badge": "High fat",
        "fat_percent": Decimal("6.5"),
        "snf_percent": Decimal("9.0"),
        "shelf_life": "Same day",
        "accent": "#2F6BF0",
        "description": "<p>Our Murrah buffaloes give a heavier, richer milk &mdash; the kind that leaves a "
        "proper layer of malai on top when you boil it. Best for kheer, paneer, and a cup of tea that tastes "
        "like it should.</p>",
        "sort_order": 2,
        "variants": [("500 ml", "0.5", "ml", "45.00", None), ("1 litre", "1", "L", "88.00", "92.00"), ("2 litre", "2", "L", "172.00", "184.00")],
    },
    {
        "name": "Desi Cow Ghee",
        "slug": "desi-cow-ghee",
        "category": "ghee",
        "kind": Product.Kind.GHEE,
        "animal": Product.Animal.COW,
        "tagline": "Bilona churned, wood fired, golden",
        "badge": "Bilona method",
        "shelf_life": "12 months",
        "accent": "#0E6B4B",
        "description": "<p>Curd is set from whole cow milk, hand churned to butter, then simmered slowly "
        "until it turns grainy and gold. Roughly thirty litres of milk go into a single kilo.</p>",
        "sort_order": 3,
        "variants": [("250 g", "0.25", "kg", "450.00", None), ("500 g", "0.5", "kg", "880.00", "900.00"), ("1 kg", "1", "kg", "1700.00", "1800.00")],
    },
    {
        "name": "Buffalo Ghee",
        "slug": "buffalo-ghee",
        "category": "ghee",
        "kind": Product.Kind.GHEE,
        "animal": Product.Animal.BUFFALO,
        "tagline": "Whiter, denser, for a heavier kitchen",
        "shelf_life": "12 months",
        "accent": "#7EC4A8",
        "description": "<p>Made the same slow way as our cow ghee, from buffalo cream. Firmer at room "
        "temperature and higher yielding &mdash; a favourite for sweets and deep frying.</p>",
        "sort_order": 4,
        "variants": [("500 g", "0.5", "kg", "800.00", None), ("1 kg", "1", "kg", "1550.00", "1600.00")],
    },
    {
        "name": "Fresh Curd",
        "slug": "fresh-curd",
        "category": "curd-chhach",
        "kind": Product.Kind.CURD,
        "animal": Product.Animal.MIXED,
        "tagline": "Set overnight in clay, never sour",
        "badge": "Set in clay",
        "shelf_life": "2 days chilled",
        "accent": "#B9CCC2",
        "description": "<p>Set in earthen pots from the evening milking and delivered the next morning. "
        "Thick enough to hold a spoon upright.</p>",
        "sort_order": 5,
        "variants": [("400 g", "0.4", "kg", "45.00", None), ("1 kg", "1", "kg", "100.00", "108.00")],
    },
    {
        "name": "Chhach",
        "slug": "chhach",
        "category": "curd-chhach",
        "kind": Product.Kind.CHHACH,
        "animal": Product.Animal.MIXED,
        "tagline": "Salted, lightly spiced, properly cold",
        "shelf_life": "Same day",
        "accent": "#17B3A0",
        "description": "<p>What is left after the butter is churned out &mdash; thin, tangy and salted with "
        "a little roasted jeera. The Rajasthan afternoon was built for this.</p>",
        "sort_order": 6,
        "morning_only": True,
        "variants": [("500 ml", "0.5", "ml", "25.00", None), ("1 litre", "1", "L", "45.00", "50.00")],
    },
]

PACKAGES = [
    {
        "name": "Just Milk",
        "slug": "just-milk",
        "tagline": "One litre of cow milk, every morning",
        "serves": "One or two people",
        "accent": "#C6F24B",
        "discount": "4.0",
        "featured": False,
        "sort": 1,
        "items": [("cow-milk", "1 litre", 1, "morning", Frequency.DAILY, [])],
    },
    {
        "name": "Family Basket",
        "slug": "family-basket",
        "tagline": "Milk every day, curd twice a week",
        "serves": "A family of four",
        "accent": "#2F6BF0",
        "discount": "8.0",
        "featured": True,
        "sort": 2,
        "items": [
            ("cow-milk", "2 litre", 1, "morning", Frequency.DAILY, []),
            ("fresh-curd", "400 g", 1, "morning", Frequency.WEEKDAYS, [0, 3]),
        ],
    },
    {
        "name": "The Full Table",
        "slug": "full-table",
        "tagline": "Buffalo milk, curd, chhach and ghee",
        "serves": "A big household",
        "accent": "#0E6B4B",
        "discount": "10.0",
        "featured": False,
        "sort": 3,
        "items": [
            ("buffalo-milk", "2 litre", 1, "morning", Frequency.DAILY, []),
            ("fresh-curd", "1 kg", 1, "morning", Frequency.WEEKDAYS, [1, 4]),
            ("chhach", "1 litre", 1, "morning", Frequency.WEEKDAYS, [6]),
            ("desi-cow-ghee", "500 g", 1, "morning", Frequency.MONTHLY, []),
        ],
    },
]

STATS = [
    ("90 min", "From udder to doorstep"),
    ("4.30 am", "First milking begins"),
    ("2", "Deliveries every day"),
    ("0", "Days spent in a warehouse"),
]

PROCESS = [
    ("4.30 am", "The shed wakes", "Our cows and buffaloes are milked by hand and machine in the same hour, every day of the year."),
    ("5.15 am", "Straight into steel", "No holding tank, no powder, no water. Milk goes from the pail into chilled steel cans."),
    ("5.30 am", "On the road", "Cans leave the farm at Village 11 SHPD while the milk is still warm from the animal."),
    ("6.00 am", "At your gate", "Poured into your own vessel or sealed pouches, whichever you asked for."),
]

TESTIMONIALS = [
    ("The malai on the buffalo milk is the thickness my mother used to get in the village. I stopped buying packets entirely.", "Sunita Beniwal", "Suratgarh"),
    ("They text me when the round is running late. Small thing, but nobody else does it.", "Ramesh Kumar", "Sriganganagar"),
    ("I put the ghee in front of my grandmother without saying anything. She asked which village it came from.", "Anjali Sharma", "Suratgarh"),
]

FAQS = [
    ("How soon after milking does it reach me?", "<p>Usually within ninety minutes. The morning round leaves the farm at 5.30 am and the evening round at 5.00 pm.</p>"),
    ("Can I pause when I travel?", "<p>Yes, from the app, any time before the cut-off. Morning deliveries can be changed until 9 pm the night before, evening deliveries until 1 pm the same day.</p>"),
    ("Do you homogenise or standardise the milk?", "<p>Neither. What the animal gives is what you get, which is why the fat varies a little with the season.</p>"),
    ("Which areas do you deliver to?", "<p>Suratgarh town and the surrounding villages in Sriganganagar district. Add your PIN code at checkout and we will confirm.</p>"),
    ("How do I pay?", "<p>Top up your Firstlight wallet and each delivery is drawn from it. You will see every charge listed against the day it happened.</p>"),
]


class Command(BaseCommand):
    help = "Seed the catalogue, plans and storefront page. Safe to run more than once."

    @transaction.atomic
    def handle(self, *args, **options):
        self.seed_categories()
        self.seed_products()
        self.seed_packages()
        self.seed_staff()
        self.seed_homepage()
        self.stdout.write(self.style.SUCCESS("Firstlight is seeded and ready."))

    def seed_categories(self):
        for name, slug, tagline, order in CATEGORIES:
            Category.objects.update_or_create(
                slug=slug, defaults={"name": name, "tagline": tagline, "sort_order": order}
            )
        self.stdout.write(f"  categories: {Category.objects.count()}")

    def seed_products(self):
        for spec in PRODUCTS:
            category = Category.objects.get(slug=spec["category"])
            product, _ = Product.objects.update_or_create(
                slug=spec["slug"],
                defaults={
                    "name": spec["name"],
                    "category": category,
                    "kind": spec["kind"],
                    "animal": spec["animal"],
                    "tagline": spec["tagline"],
                    "description": spec["description"],
                    "badge": spec.get("badge", ""),
                    "fat_percent": spec.get("fat_percent"),
                    "snf_percent": spec.get("snf_percent"),
                    "shelf_life": spec.get("shelf_life", "Same day"),
                    "accent": spec["accent"],
                    "sort_order": spec["sort_order"],
                    "is_subscribable": True,
                    "available_morning": True,
                    "available_evening": not spec.get("morning_only", False),
                    "is_active": True,
                },
            )
            for index, (label, qty, unit, price, compare) in enumerate(spec["variants"]):
                ProductVariant.objects.update_or_create(
                    product=product,
                    label=label,
                    defaults={
                        "quantity": Decimal(qty),
                        "unit": unit,
                        "price": Decimal(price),
                        "compare_at_price": Decimal(compare) if compare else None,
                        "sku": f"{product.slug[:6].upper()}-{label.replace(' ', '').upper()}",
                        "sort_order": index,
                        "is_active": True,
                    },
                )
        self.stdout.write(f"  products: {Product.objects.count()} / variants: {ProductVariant.objects.count()}")

    def seed_packages(self):
        for spec in PACKAGES:
            package, _ = Package.objects.update_or_create(
                slug=spec["slug"],
                defaults={
                    "name": spec["name"],
                    "tagline": spec["tagline"],
                    "serves": spec["serves"],
                    "accent": spec["accent"],
                    "discount_percent": Decimal(spec["discount"]),
                    "is_featured": spec["featured"],
                    "sort_order": spec["sort"],
                    "is_active": True,
                },
            )
            package.items.all().delete()
            for order, (slug, label, qty, slot, frequency, weekdays) in enumerate(spec["items"]):
                variant = ProductVariant.objects.get(product__slug=slug, label=label)
                PackageItem.objects.create(
                    package=package,
                    variant=variant,
                    quantity=qty,
                    slot=slot,
                    frequency=frequency,
                    weekdays=weekdays,
                    sort_order=order,
                )
        self.stdout.write(f"  packages: {Package.objects.count()}")

    def seed_staff(self):
        from accounts.models import User

        admin = User.objects.filter(username="admin").first()
        if admin is None:
            admin = User.objects.create_superuser("admin", password="firstlight", full_name="Farm Admin")
            self.stdout.write("  staff: created 'admin' (password: firstlight)")
        else:
            self.stdout.write("  staff: 'admin' already there")

    def seed_homepage(self):
        body = [
            {"type": "stats", "value": [{"value": v, "label": l} for v, l in STATS]},
            {"type": "process", "value": [{"time": t, "title": ti, "body": b} for t, ti, b in PROCESS]},
            {"type": "testimonials", "value": [{"quote": q, "name": n, "place": p} for q, n, p in TESTIMONIALS]},
            {"type": "faqs", "value": [{"question": q, "answer": a} for q, a in FAQS]},
        ]

        home = HomePage.objects.first()
        if home is None:
            root = Page.objects.get(depth=1)
            # Wagtail installs a placeholder "Welcome" page; retire it.
            for stale in Page.objects.child_of(root).exclude(pk=root.pk):
                stale.delete()
            root.refresh_from_db()
            home = HomePage(
                title="Firstlight",
                slug="home",
                seo_title="Firstlight — fresh cow and buffalo milk from Suratgarh",
            )
            root.add_child(instance=home)

        home.hero_eyebrow = "Village 11 SHPD, Suratgarh"
        home.hero_heading = "Milk that never sees a warehouse."
        home.hero_subheading = (
            "Drawn at first light from our own cows and buffaloes, and at your door "
            "before the day gets warm. Twice a day, every day."
        )
        home.hero_cta_label = "Start a subscription"
        home.story_heading = "One farm. Two milkings. Nothing in between."
        home.story_body = (
            "<p>Firstlight is a single farm in Sriganganagar district, not a collection centre. "
            "The animals you are buying from are the ones standing in our shed. There is no "
            "aggregator, no chilling plant, no three-day journey in a tanker.</p>"
            "<p>What that means for you is simple: the milk on your stove this morning was "
            "inside an animal ninety minutes ago.</p>"
        )
        home.body = body
        revision = home.save_revision()
        revision.publish()

        # Deleting Wagtail's placeholder page cascades the default Site away with it,
        # so recreate rather than assume one is there.
        site = Site.objects.filter(is_default_site=True).first()
        if site is None:
            site = Site(is_default_site=True)
        site.root_page = home
        site.site_name = "Firstlight"
        site.hostname = "localhost"
        site.port = 8000
        site.save()
        self.stdout.write("  storefront page published")
