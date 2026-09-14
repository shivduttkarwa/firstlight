"""The farm's own dashboard API.

Everything the people running Firstlight need, shaped for the two screens they
actually use: a phone on the round, and a desktop in the office. No Wagtail
vocabulary leaks through here.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Max, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.text import slugify
from PIL import Image as PILImage
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from wagtail.images import get_image_model

from accounts.models import User
from catalog.models import Category, Product, ProductVariant, kind_label, normalise_kind
from catalog.serializers import ProductSerializer
from offers.models import Coupon
from orders.models import Delivery, OrderItem, Wallet
from orders.money import parse_amount
from subscriptions.models import Package, PackageItem, Subscription, SubscriptionLine
from subscriptions.serializers import PackageSerializer, SubscriptionSerializer
from subscriptions.services import build_roster, ensure_roster
from website.models import HomePage

# Still to be handed over: what a rider can deliver, or miss.
OPEN = (Delivery.Status.SCHEDULED, Delivery.Status.OUT)


def product_in_baskets(product):
    return SubscriptionLine.objects.filter(
        variant__product=product, is_active=True, subscription__status__in=["active", "paused"]
    ).count()


def used_variant_ids(ids=None):
    """Pack sizes something points at: they can be hidden, never renamed or deleted."""
    used = set()
    for model in (SubscriptionLine, PackageItem, Delivery, OrderItem, Coupon):
        rows = model.objects.exclude(variant=None)
        if ids is not None:
            rows = rows.filter(variant_id__in=ids)
        used.update(rows.order_by().values_list("variant_id", flat=True).distinct())
    return used


class StaffVariantSerializer(serializers.ModelSerializer):
    in_use = serializers.SerializerMethodField()

    class Meta:
        model = ProductVariant
        fields = ["id", "label", "price", "compare_at_price", "is_active", "in_use"]

    def get_in_use(self, obj):
        return obj.pk in self.context.get("used_variants", ())


class StaffProductSerializer(ProductSerializer):
    """The shop's product, plus what only the farm needs to see."""

    is_active = serializers.BooleanField(read_only=True)
    available_morning = serializers.BooleanField(read_only=True)
    available_evening = serializers.BooleanField(read_only=True)

    class Meta(ProductSerializer.Meta):
        fields = [*ProductSerializer.Meta.fields, "is_active", "available_morning", "available_evening"]

    def get_variants(self, obj):
        return StaffVariantSerializer(obj.variants.all(), many=True, context=self.context).data


class IsFarmStaff(BasePermission):
    message = "This area is for farm staff."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


def parse_date(value, fallback=None):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return fallback


def money(value):
    return str((value or Decimal("0")).quantize(Decimal("0.01")))


# --- The round ---------------------------------------------------------------


class RoundView(APIView):
    """One slot's deliveries, grouped into stops the rider walks between."""

    permission_classes = [IsFarmStaff]

    def get(self, request):
        ensure_roster()
        day = parse_date(request.query_params.get("date"), timezone.localdate())
        slot = request.query_params.get("slot", "morning")

        rows = (
            Delivery.objects.filter(date=day, slot=slot)
            .select_related("user", "address", "variant__product")
            .order_by("address__village", "address__line1", "id")
        )

        stops = {}
        for row in rows:
            stop = stops.setdefault(
                row.address_id,
                {
                    "address_id": row.address_id,
                    "customer_id": row.user_id,
                    "customer": row.user.full_name or row.user.phone,
                    "phone": row.address.contact_phone or row.user.phone,
                    "line1": row.address.line1,
                    "landmark": row.address.landmark,
                    "village": row.address.village,
                    "pincode": row.address.pincode,
                    "note": row.address.delivery_note,
                    "items": [],
                    "value": Decimal("0"),
                    "to_charge": Decimal("0"),
                },
            )
            stop["items"].append(
                {
                    "delivery_id": row.id,
                    "product": row.variant.product.name,
                    "accent": row.variant.product.accent,
                    "kind": row.variant.product.kind,
                    "variant_label": row.variant.label,
                    "quantity": row.quantity,
                    "total": money(row.total),
                    "status": row.status,
                }
            )
            stop["value"] += row.total
            if row.status in OPEN:
                stop["to_charge"] += row.total

        balances = dict(
            Wallet.objects.filter(user_id__in={s["customer_id"] for s in stops.values()}).values_list(
                "user_id", "balance"
            )
        )

        out = []
        for stop in stops.values():
            states = {item["status"] for item in stop["items"]}
            stop["status"] = (
                "done"
                if not states & set(OPEN)
                else "part"
                if Delivery.Status.DELIVERED in states
                else "pending"
            )
            balance = balances.get(stop["customer_id"], Decimal("0"))
            # Only what is still to be handed over can overdraw the wallet.
            stop["wallet_low"] = balance < stop.pop("to_charge")
            stop["value"] = money(stop["value"])
            stop["wallet_balance"] = money(balance)
            out.append(stop)

        totals = rows.aggregate(items=Count("id"), value=Sum("total"))
        done = rows.filter(status=Delivery.Status.DELIVERED).count()
        pending = rows.filter(status__in=OPEN).count()

        return Response(
            {
                "date": day.isoformat(),
                "slot": slot,
                "totals": {
                    "stops": len(out),
                    "items": totals["items"] or 0,
                    "value": money(totals["value"]),
                    "done": done,
                    "pending": pending,
                },
                "stops": out,
            }
        )


class MarkView(APIView):
    """Mark deliveries done or failed. Marking done debits the wallet."""

    permission_classes = [IsFarmStaff]

    @transaction.atomic
    def post(self, request):
        new_status = request.data.get("status", Delivery.Status.DELIVERED)
        if new_status not in dict(Delivery.Status.choices):
            return Response({"detail": "Unknown status."}, status=status.HTTP_400_BAD_REQUEST)

        ids = request.data.get("delivery_ids")
        if ids:
            if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
                return Response({"detail": "delivery_ids must be a list of ids."}, status=status.HTTP_400_BAD_REQUEST)
            rows = Delivery.objects.filter(id__in=ids)
        else:
            address = request.data.get("address")
            day = parse_date(request.data.get("date"), timezone.localdate())
            slot = request.data.get("slot", "morning")
            if not address:
                return Response(
                    {"detail": "Send delivery_ids, or an address with a date and slot."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            # A whole stop only moves what is still open: items the rider has
            # already delivered or marked missed keep their status.
            rows = Delivery.objects.filter(address_id=address, date=day, slot=slot, status__in=OPEN)

        changed = sum(
            1 for row in rows.select_related("user", "variant__product") if row.set_status(new_status)
        )
        return Response({"changed": changed, "detail": f"{changed} marked {new_status}."})


# --- Overview ----------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsFarmStaff])
def overview(request):
    ensure_roster()
    today = timezone.localdate()
    month_start = today.replace(day=1)

    today_rows = Delivery.objects.filter(date=today)
    by_slot = {}
    for slot in ("morning", "evening"):
        rows = today_rows.filter(slot=slot)
        by_slot[slot] = {
            "items": rows.count(),
            "stops": rows.values("address_id").distinct().count(),
            "done": rows.filter(status=Delivery.Status.DELIVERED).count(),
            "value": money(rows.aggregate(v=Sum("total"))["v"]),
        }

    month = Delivery.objects.filter(date__gte=month_start, status=Delivery.Status.DELIVERED).aggregate(
        count=Count("id"), value=Sum("total")
    )

    customers = User.objects.filter(is_staff=False)
    low_wallets = (
        Wallet.objects.filter(balance__lt=Decimal("200"), user__subscriptions__status="active")
        .select_related("user")
        .distinct()[:10]
    )

    # What the shed needs to fill tomorrow, by product.
    tomorrow = today + timedelta(days=1)
    production = (
        Delivery.objects.filter(date=tomorrow)
        .values("variant__product__name", "variant__label", "slot")
        .annotate(packs=Sum("quantity"))
        .order_by("slot", "variant__product__name")
    )

    return Response(
        {
            "today": today.isoformat(),
            "slots": by_slot,
            "month": {"delivered": month["count"] or 0, "value": money(month["value"])},
            "customers": {
                "total": customers.count(),
                "active": customers.filter(subscriptions__status="active").distinct().count(),
                "new_this_month": customers.filter(date_joined__gte=month_start).count(),
            },
            "low_wallets": [
                {
                    "id": w.user_id,
                    "name": w.user.full_name or w.user.phone,
                    "phone": w.user.phone,
                    "balance": money(w.balance),
                }
                for w in low_wallets
            ],
            "tomorrow": [
                {
                    "product": row["variant__product__name"],
                    "variant": row["variant__label"],
                    "slot": row["slot"],
                    "packs": row["packs"],
                }
                for row in production
            ],
        }
    )


# --- Customers ---------------------------------------------------------------


class CustomerViewSet(viewsets.ViewSet):
    permission_classes = [IsFarmStaff]

    def list(self, request):
        search = (request.query_params.get("q") or "").strip()
        rows = User.objects.filter(is_staff=False)
        if search:
            rows = rows.filter(Q(full_name__icontains=search) | Q(phone__icontains=search))

        rows = rows.annotate(
            active_subs=Count("subscriptions", filter=Q(subscriptions__status="active"), distinct=True)
        ).order_by("-date_joined")[:200]

        balances = dict(Wallet.objects.filter(user__in=rows).values_list("user_id", "balance"))
        return Response(
            [
                {
                    "id": u.id,
                    "name": u.full_name or "Unnamed",
                    "phone": u.phone,
                    "joined": timezone.localdate(u.date_joined).isoformat(),
                    "active_subscriptions": u.active_subs,
                    "wallet_balance": money(balances.get(u.id, Decimal("0"))),
                }
                for u in rows
            ]
        )

    def retrieve(self, request, pk=None):
        user = get_object_or_404(User, pk=pk, is_staff=False)
        wallet = Wallet.for_user(user)
        subs = (
            Subscription.objects.filter(user=user)
            .exclude(status="cancelled")
            .select_related("address", "package")
            .prefetch_related("lines__variant__product", "lines__overrides")
        )
        upcoming = (
            Delivery.objects.filter(user=user, date__gte=timezone.localdate())
            .select_related("variant__product")
            .order_by("date")[:10]
        )
        return Response(
            {
                "id": user.id,
                "name": user.full_name or "Unnamed",
                "phone": user.phone,
                "email": user.email,
                "joined": timezone.localdate(user.date_joined).isoformat(),
                "wallet_balance": money(wallet.balance),
                "addresses": [
                    {
                        "id": a.id,
                        "label": a.label,
                        "line1": a.line1,
                        "landmark": a.landmark,
                        "village": a.village,
                        "pincode": a.pincode,
                        "note": a.delivery_note,
                        "is_default": a.is_default,
                    }
                    for a in user.addresses.all()
                ],
                "subscriptions": SubscriptionSerializer(
                    subs, many=True, context={"request": request}
                ).data,
                "upcoming": [
                    {
                        "id": d.id,
                        "date": d.date.isoformat(),
                        "slot": d.slot,
                        "product": d.variant.product.name,
                        "variant_label": d.variant.label,
                        "quantity": d.quantity,
                        "total": money(d.total),
                        "status": d.status,
                    }
                    for d in upcoming
                ],
                "recent_transactions": [
                    {
                        "id": t.id,
                        "kind": t.kind,
                        "amount": money(t.amount),
                        "balance_after": money(t.balance_after),
                        "note": t.note,
                        "at": t.created_at.isoformat(),
                    }
                    for t in wallet.transactions.all()[:15]
                ],
            }
        )

    @action(detail=True, methods=["post"])
    def topup(self, request, pk=None):
        """Record money the customer handed over. Cash, UPI, whatever."""
        user = get_object_or_404(User, pk=pk, is_staff=False)
        amount = parse_amount(request.data.get("amount"))
        if amount is None:
            return Response({"detail": "Enter an amount between 1 and 50,000."}, status=status.HTTP_400_BAD_REQUEST)

        wallet = Wallet.for_user(user)
        # Who took the money is always on the ledger, whatever note is typed.
        taken_by = f"taken by {request.user.get_short_name()}"
        custom = str(request.data.get("note") or "").strip()
        note = f"{custom[:150]} · {taken_by}" if custom else f"Top-up {taken_by}"
        wallet.credit(amount, note)
        return Response({"balance": money(wallet.balance), "detail": f"Added {money(amount)}."})


# --- Catalogue ---------------------------------------------------------------


MAX_PRICE = Decimal("100000")
MAX_PHOTO_BYTES = 10 * 1024 * 1024
PHOTO_FORMATS = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}
FORM_LABELS = {
    "name": "Name",
    "kind": "Type",
    "tagline": "Short line",
    "description": "Description",
    "badge": "Badge",
    "fat_percent": "Fat",
    "snf_percent": "SNF",
    "shelf_life": "Keeps",
    "accent": "Colour",
}


class ProductProblem(Exception):
    pass


class PackForm(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    label = serializers.CharField(max_length=40, error_messages={"blank": "Name it, e.g. 500 g."})
    price = serializers.CharField(error_messages={"blank": "Give it a price."})
    compare_at_price = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_active = serializers.BooleanField(default=True)

    def validate_label(self, value):
        return " ".join(value.split())

    def validate_price(self, value):
        price = parse_amount(value, high=MAX_PRICE)
        if price is None:
            raise serializers.ValidationError("Give a price between ₹1 and ₹1,00,000.")
        return price

    def validate_compare_at_price(self, value):
        if value in (None, ""):
            return None
        price = parse_amount(value, high=MAX_PRICE)
        if price is None:
            raise serializers.ValidationError("Give the old price as a number, or leave it empty.")
        return price

    def validate(self, attrs):
        was = attrs.get("compare_at_price")
        if was is not None and was <= attrs["price"]:
            raise serializers.ValidationError("The old price has to be more than the price.")
        return attrs


class ProductForm(serializers.Serializer):
    name = serializers.CharField(max_length=120, error_messages={"blank": "Give the product a name."})
    kind = serializers.CharField(max_length=40, error_messages={"blank": "Choose a type, or add a new one."})
    animal = serializers.ChoiceField(choices=Product.Animal.choices, default=Product.Animal.COW)
    tagline = serializers.CharField(max_length=160, allow_blank=True, default="")
    description = serializers.CharField(max_length=5000, allow_blank=True, default="")
    badge = serializers.CharField(max_length=30, allow_blank=True, default="")
    fat_percent = serializers.DecimalField(
        max_digits=4, decimal_places=1, min_value=Decimal("0"), max_value=Decimal("100"), allow_null=True, default=None
    )
    snf_percent = serializers.DecimalField(
        max_digits=4, decimal_places=1, min_value=Decimal("0"), max_value=Decimal("100"), allow_null=True, default=None
    )
    shelf_life = serializers.CharField(max_length=80, allow_blank=True, default="")
    accent = serializers.RegexField(
        r"^#[0-9A-Fa-f]{6}$", default="#C6F24B", error_messages={"invalid": "Pick one of the colours."}
    )
    available_morning = serializers.BooleanField(default=True)
    available_evening = serializers.BooleanField(default=True)
    is_active = serializers.BooleanField(default=True)
    variants = PackForm(many=True)

    def validate_kind(self, value):
        kind = normalise_kind(value)
        if not kind:
            raise serializers.ValidationError("Use letters or numbers, e.g. Paneer.")
        return kind

    def validate_variants(self, packs):
        if not any(pack["is_active"] for pack in packs):
            raise serializers.ValidationError("Keep at least one pack size in the shop.")
        labels = [pack["label"].lower() for pack in packs]
        ids = [pack["id"] for pack in packs if "id" in pack]
        if len(set(labels)) != len(labels) or len(set(ids)) != len(ids):
            raise serializers.ValidationError("Two pack sizes have the same name.")
        return packs

    def validate(self, attrs):
        if not (attrs["available_morning"] or attrs["available_evening"]):
            raise serializers.ValidationError("Pick the morning round, the evening round or both.")
        return attrs


def first_message(errors):
    if isinstance(errors, dict):
        errors = list(errors.values())
    if isinstance(errors, list):
        return next((message for message in map(first_message, errors) if message), None)
    return str(errors) or None


def form_problem(errors):
    for field, problem in errors.items():
        if field == "variants" and isinstance(problem, (dict, list)):
            # One bad pack comes back keyed by its position; a problem with the whole list comes back as a list.
            rows = problem.items() if isinstance(problem, dict) else enumerate(problem)
            for index, row in rows:
                message = first_message(row)
                if message:
                    return f"Pack size {int(index) + 1}: {message}" if isinstance(row, dict) else message
        message = first_message(problem)
        if message:
            return f"{FORM_LABELS[field]}: {message}" if field in FORM_LABELS else message
    return "Please check the form."


def unique_slug(name):
    base = slugify(name)[:110] or "product"
    slug, n = base, 2
    while Product.objects.filter(slug=slug).exists():
        slug, n = f"{base}-{n}", n + 1
    return slug


@transaction.atomic
def save_product(data, product=None):
    data = dict(data)
    packs = data.pop("variants")
    if product is None:
        product = Product(
            slug=unique_slug(data["name"]),
            sort_order=(Product.objects.aggregate(last=Max("sort_order"))["last"] or 0) + 1,
        )
    moved = product.category_id is None or product.kind != data["kind"]
    for field, value in data.items():
        setattr(product, field, value)
    if moved:
        sibling = Product.objects.filter(kind=product.kind).exclude(pk=product.pk).select_related("category").first()
        product.category = (
            sibling.category
            if sibling
            else Category.objects.get_or_create(slug=product.kind, defaults={"name": kind_label(product.kind)})[0]
        )
    product.save()

    existing = {v.pk: v for v in ProductVariant.objects.filter(product=product)}
    used = used_variant_ids(list(existing))
    kept = set()
    for order, pack in enumerate(packs):
        if "id" in pack:
            variant = existing.get(pack["id"])
            if variant is None:
                raise ProductProblem(f"Pack size {order + 1} isn't part of {product.name} any more. Reload and try again.")
            if variant.pk in used and variant.label != pack["label"]:
                raise ProductProblem(
                    f"{variant.label} has already been ordered, so its name stays. Hide it and add a new pack size instead."
                )
        else:
            variant = ProductVariant(product=product)
        variant.label = pack["label"]
        variant.price = pack["price"]
        variant.compare_at_price = pack.get("compare_at_price")
        variant.is_active = pack["is_active"]
        variant.sort_order = order
        variant.sku = variant.sku or f"{product.slug[:6]}-{variant.label.replace(' ', '')}".upper()[:40]
        variant.save()
        kept.add(variant.pk)

    for pk, variant in existing.items():
        if pk in kept:
            continue
        if pk in used:
            ProductVariant.objects.filter(pk=pk).update(is_active=False)
        else:
            variant.delete()
    return product


class StaffProductViewSet(viewsets.ReadOnlyModelViewSet):
    """Products, pack sizes and prices, editable without touching a CMS."""

    permission_classes = [IsFarmStaff]
    serializer_class = StaffProductSerializer
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        return Product.objects.all().select_related("category", "image").prefetch_related("variants")

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "used_variants": used_variant_ids()}

    def create(self, request):
        return self.write(request, None, status.HTTP_201_CREATED)

    def update(self, request, slug=None):
        return self.write(request, self.get_object(), status.HTTP_200_OK)

    def write(self, request, product, code):
        form = ProductForm(data=request.data)
        if not form.is_valid():
            return Response(
                {"detail": form_problem(form.errors), "fields": form.errors}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            product = save_product(form.validated_data, product)
        except ProductProblem as problem:
            return Response({"detail": str(problem)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(self.get_queryset().get(pk=product.pk)).data, status=code)

    @action(detail=True, methods=["post", "delete"])
    def photo(self, request, slug=None):
        product = self.get_object()
        if request.method == "DELETE":
            product.image = None
            product.save(update_fields=["image"])
            return Response(self.get_serializer(product).data)

        upload = request.FILES.get("photo")
        if upload is None:
            return Response({"detail": "Choose a photo to upload."}, status=status.HTTP_400_BAD_REQUEST)
        if upload.size > MAX_PHOTO_BYTES:
            return Response({"detail": "That photo is over 10 MB. Try a smaller one."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            with PILImage.open(upload) as picture:
                extension = PHOTO_FORMATS.get(picture.format)
                picture.verify()
        except (OSError, SyntaxError, ValueError, PILImage.DecompressionBombError):
            extension = None
        if extension is None:
            return Response(
                {"detail": "That file isn't a photo we can use. Try a JPG, PNG or WebP."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        upload.seek(0)
        upload.name = f"{product.slug}.{extension}"
        image = get_image_model()(title=product.name, file=upload, uploaded_by_user=request.user)
        image.save()
        product.image = image
        product.save(update_fields=["image"])
        return Response(self.get_serializer(product).data)

    @action(detail=False, methods=["post"], url_path="set-price")
    def set_price(self, request):
        variant = get_object_or_404(ProductVariant, pk=request.data.get("variant"))
        price = parse_amount(request.data.get("price"), high=Decimal("100000"))
        if price is None:
            return Response({"detail": "That price looks wrong."}, status=status.HTTP_400_BAD_REQUEST)

        variant.price = price
        variant.save(update_fields=["price"])
        return Response(
            {
                "detail": f"{variant.product.name} {variant.label} is now {money(price)}.",
                "note": "Baskets that already have it keep their price; new ones pay the new price.",
            }
        )

    @action(detail=True, methods=["post"], url_path="toggle")
    def toggle(self, request, slug=None):
        product = self.get_object()
        product.is_active = not product.is_active
        product.save(update_fields=["is_active"])
        in_baskets = product_in_baskets(product)
        detail = (
            f"{product.name} is back in the shop."
            if product.is_active
            else f"{product.name} is hidden from the shop."
            + (f" {in_baskets} basket item(s) still receive it until changed." if in_baskets else "")
        )
        return Response({"is_active": product.is_active, "in_baskets": in_baskets, "detail": detail})


class StaffPackageViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsFarmStaff]
    serializer_class = PackageSerializer
    pagination_class = None
    lookup_field = "slug"

    def get_queryset(self):
        return Package.objects.all().prefetch_related("items__variant__product")


# --- Website text ------------------------------------------------------------

EDITABLE = ("hero_eyebrow", "hero_heading", "hero_subheading", "hero_cta_label", "story_heading", "story_body")


class ContentView(APIView):
    """The handful of sentences on the storefront the farm may want to change."""

    permission_classes = [IsFarmStaff]

    def get(self, request):
        page = HomePage.objects.first()
        if page is None:
            return Response({"detail": "No storefront page yet."}, status=status.HTTP_404_NOT_FOUND)
        data = {field: getattr(page, field) for field in EDITABLE}
        data["blocks"] = [{"type": b.block_type, "id": b.id} for b in page.body]
        return Response(data)

    def patch(self, request):
        live = HomePage.objects.first()
        if live is None:
            return Response({"detail": "No storefront page yet."}, status=status.HTTP_404_NOT_FOUND)
        # Build on the latest revision, so a draft someone saved in the Wagtail
        # admin is carried forward rather than thrown away.
        page = live.get_latest_revision_as_object()
        touched = []
        for field in EDITABLE:
            if field in request.data:
                value = request.data[field]
                if not isinstance(value, str):
                    return Response({"detail": f"{field} must be text."}, status=status.HTTP_400_BAD_REQUEST)
                setattr(page, field, value.strip())
                touched.append(field)
        if not touched:
            return Response({"detail": "Nothing to change."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            page.full_clean()
            page.save_revision(user=request.user).publish(user=request.user)
        except DjangoValidationError as error:
            messages = {field: " ".join(errors) for field, errors in error.message_dict.items()}
            return Response(
                {"detail": next(iter(messages.values()), "Please check the text."), "fields": messages},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"detail": "Website updated.", "changed": touched})


# --- Housekeeping ------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsFarmStaff])
def rebuild_roster(request):
    try:
        days = int(request.data.get("days") or 14)
    except (TypeError, ValueError):
        return Response({"detail": "days must be a whole number."}, status=status.HTTP_400_BAD_REQUEST)
    return Response(build_roster(days=min(max(days, 1), 60)))


@api_view(["GET"])
@permission_classes([IsFarmStaff])
def categories(request):
    return Response([{"id": c.id, "name": c.name, "slug": c.slug} for c in Category.objects.all()])
