from decimal import Decimal

from django.db import models
from django.utils.text import slugify
from modelcluster.fields import ParentalKey
from modelcluster.models import ClusterableModel
from wagtail.admin.panels import FieldPanel, InlinePanel, MultiFieldPanel
from wagtail.fields import RichTextField
from wagtail.models import Orderable
from wagtail.search import index


def normalise_kind(raw):
    return slugify(str(raw or ""))[:30].strip("-")


def kind_label(kind):
    return kind.replace("-", " ").capitalize()


class Slot(models.TextChoices):
    MORNING = "morning", "Morning (5.30 – 8.00 am)"
    EVENING = "evening", "Evening (5.00 – 7.30 pm)"


class Category(models.Model):
    name = models.CharField(max_length=60)
    slug = models.SlugField(max_length=60, unique=True)
    tagline = models.CharField(max_length=140, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    panels = [FieldPanel("name"), FieldPanel("slug"), FieldPanel("tagline"), FieldPanel("sort_order")]

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Product(ClusterableModel, index.Indexed):
    class Animal(models.TextChoices):
        COW = "cow", "Cow"
        BUFFALO = "buffalo", "Buffalo"
        MIXED = "mixed", "Cow + Buffalo"
        NONE = "none", "Not applicable"

    class Kind(models.TextChoices):
        MILK = "milk", "Milk"
        GHEE = "ghee", "Ghee"
        CURD = "curd", "Curd"
        CHHACH = "chhach", "Chhach"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    category = models.ForeignKey(Category, related_name="products", on_delete=models.PROTECT)
    kind = models.CharField(max_length=30, default=Kind.MILK, help_text="What sort of product, e.g. milk, ghee, paneer")
    animal = models.CharField(max_length=10, choices=Animal.choices, default=Animal.COW)

    tagline = models.CharField(max_length=160, blank=True)
    description = RichTextField(blank=True, features=["bold", "italic", "link", "ul"])
    badge = models.CharField(max_length=30, blank=True, help_text="e.g. Bestseller, A2, Farm favourite")

    fat_percent = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    snf_percent = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    shelf_life = models.CharField(max_length=80, blank=True, default="Same day")

    image = models.ForeignKey("wagtailimages.Image", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    accent = models.CharField(max_length=7, default="#C6F24B", help_text="Hex colour used on the storefront card")

    is_subscribable = models.BooleanField(default=True)
    available_morning = models.BooleanField(default=True)
    available_evening = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    search_fields = [index.SearchField("name"), index.SearchField("tagline"), index.AutocompleteField("name")]

    panels = [
        MultiFieldPanel(
            [FieldPanel("name"), FieldPanel("slug"), FieldPanel("category"), FieldPanel("kind"), FieldPanel("animal")],
            heading="Identity",
        ),
        MultiFieldPanel(
            [FieldPanel("tagline"), FieldPanel("description"), FieldPanel("badge"), FieldPanel("image"), FieldPanel("accent")],
            heading="Storefront",
        ),
        MultiFieldPanel(
            [FieldPanel("fat_percent"), FieldPanel("snf_percent"), FieldPanel("shelf_life")],
            heading="Quality",
        ),
        MultiFieldPanel(
            [
                FieldPanel("is_subscribable"),
                FieldPanel("available_morning"),
                FieldPanel("available_evening"),
                FieldPanel("is_active"),
                FieldPanel("sort_order"),
            ],
            heading="Availability",
        ),
        InlinePanel("variants", heading="Pack sizes", min_num=1),
    ]

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    @property
    def slots(self):
        out = []
        if self.available_morning:
            out.append(Slot.MORNING)
        if self.available_evening:
            out.append(Slot.EVENING)
        return out

    @property
    def from_price(self):
        prices = [v.price for v in self.variants.all()]
        return min(prices) if prices else Decimal("0")


class ProductVariant(Orderable):
    class Unit(models.TextChoices):
        LITRE = "L", "litre"
        ML = "ml", "millilitre"
        KG = "kg", "kilogram"
        GRAM = "g", "gram"

    product = ParentalKey(Product, related_name="variants", on_delete=models.CASCADE)
    label = models.CharField(max_length=40, help_text="e.g. 500 ml, 1 litre, 250 g")
    quantity = models.DecimalField(max_digits=6, decimal_places=3, default=Decimal("1.000"))
    unit = models.CharField(max_length=4, choices=Unit.choices, default=Unit.LITRE)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    compare_at_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    sku = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)

    panels = [
        FieldPanel("label"),
        FieldPanel("quantity"),
        FieldPanel("unit"),
        FieldPanel("price"),
        FieldPanel("compare_at_price"),
        FieldPanel("sku"),
        FieldPanel("is_active"),
    ]

    class Meta(Orderable.Meta):
        verbose_name = "pack size"

    def __str__(self):
        return f"{self.product.name} — {self.label}"
