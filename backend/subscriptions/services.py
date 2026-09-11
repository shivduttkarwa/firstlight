"""Turning baskets into a day-by-day delivery roster."""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from orders.models import Delivery

from .cutoffs import is_locked
from .models import DayOverride, Subscription, line_total

# Fields a scheduled delivery copies from its line. If the customer edits the
# basket, rows we have not dispatched yet must follow.
MIRRORED = ("slot", "variant_id", "unit_price")


def resume_due(queryset=None):
    """Baskets paused until a date that has now arrived are simply active again."""
    queryset = Subscription.objects.all() if queryset is None else queryset
    return queryset.filter(status=Subscription.Status.PAUSED, resume_on__lte=timezone.localdate()).update(
        status=Subscription.Status.ACTIVE, resume_on=None
    )


def ensure_roster():
    """Top the roster up once a day, in case the nightly ``build_roster`` job
    is not scheduled. Cheap to call from any busy endpoint."""
    if cache.add(f"roster-built:{timezone.localdate()}", True, 26 * 3600):
        build_roster()


@transaction.atomic
def build_roster(days=None, from_date=None, subscription=None):
    """Create Delivery rows for active baskets over the coming window.

    Safe to run repeatedly. Rows for days the customer has since skipped or
    paused are withdrawn while still 'scheduled', and rows that survive are
    brought back in line with the basket as it now stands.

    A round that is past its cut-off is packed: its rows are left exactly as
    they are, whatever has happened to the basket since.

    Pass ``subscription`` to re-roster one basket instead of the whole book.
    """
    days = days or getattr(settings, "DELIVERY_ROSTER_DAYS", 14)
    start = from_date or timezone.localdate()
    now = timezone.now()

    if subscription is not None:
        resume_due(Subscription.objects.filter(pk=subscription.pk))
        subscription.refresh_from_db(fields=["status", "resume_on"])
        # Staff can roster further ahead than the default, and those rows must
        # still follow a pause or a cancel.
        furthest = Delivery.objects.filter(
            subscription=subscription, date__gte=start, status=Delivery.Status.SCHEDULED
        ).aggregate(last=Max("date"))["last"]
        if furthest:
            days = max(days, (furthest - start).days + 1)
        baskets = [subscription]
    else:
        resume_due()
        baskets = list(
            Subscription.objects.filter(
                status__in=[Subscription.Status.ACTIVE, Subscription.Status.PAUSED]
            )
            .select_related("address", "user", "package")
            .prefetch_related("lines__variant__product")
        )

    window = [start + timedelta(days=i) for i in range(days)]
    last = window[-1]

    # Two builds of the same basket at once (a double tap, or an edit during the
    # nightly run) would both try to create the same rows. Take turns instead.
    list(Subscription.objects.select_for_update().filter(pk__in=[b.pk for b in baskets]).values_list("pk"))

    # One query for every override in the window rather than one per line per day.
    overrides = defaultdict(dict)
    for line_id, day, quantity in DayOverride.objects.filter(
        line__subscription__in=baskets, date__gte=start, date__lte=last
    ).values_list("line_id", "date", "quantity"):
        overrides[line_id][day] = quantity

    # Every existing row in the window, in one query.
    existing = defaultdict(list)
    for row in Delivery.objects.filter(subscription__in=baskets, date__gte=start, date__lte=last):
        existing[row.line_id].append(row)

    created = removed = updated = 0
    new_rows = []

    for basket in baskets:
        discount = basket.discount_percent or Decimal("0")

        for line in basket.lines.all():
            wanted = {}
            if line.is_active:
                for day in window:
                    if is_locked(day, line.slot, now):
                        continue
                    quantity = line.quantity_on(day, overrides)
                    if quantity:
                        wanted[day] = quantity

            # Rows the rider has already dealt with, or on a packed round, are
            # never recreated: (line, date) is unique, so one row per day.
            have = {r.date for r in existing[line.id]}
            rows = [r for r in existing[line.id] if not is_locked(r.date, r.slot, now)]

            withdrawn = [r for r in rows if r.status == Delivery.Status.SCHEDULED and r.date not in wanted]
            if withdrawn:
                Delivery.objects.filter(pk__in=[r.pk for r in withdrawn]).delete()
                removed += len(withdrawn)

            dropped = {r.pk for r in withdrawn}
            kept = [r for r in rows if r.pk not in dropped]

            for row in kept:
                if row.status != Delivery.Status.SCHEDULED or row.date not in wanted:
                    continue
                quantity = wanted[row.date]
                total = line_total(line.unit_price, quantity, discount)
                changes = [f for f in MIRRORED if getattr(row, f) != getattr(line, f)]
                if row.quantity != quantity:
                    changes.append("quantity")
                if row.total != total:
                    changes.append("total")
                if row.address_id != basket.address_id:
                    changes.append("address_id")
                if not changes:
                    continue
                for field in changes:
                    if field == "total":
                        row.total = total
                    elif field == "quantity":
                        row.quantity = quantity
                    elif field == "address_id":
                        row.address_id = basket.address_id
                    else:
                        setattr(row, field, getattr(line, field))
                row.save(update_fields=changes)
                updated += 1

            for day, quantity in sorted(wanted.items()):
                if day in have:
                    continue
                new_rows.append(
                    Delivery(
                        line=line,
                        subscription=basket,
                        user_id=basket.user_id,
                        address_id=basket.address_id,
                        variant_id=line.variant_id,
                        date=day,
                        slot=line.slot,
                        quantity=quantity,
                        unit_price=line.unit_price,
                        total=line_total(line.unit_price, quantity, discount),
                    )
                )

    Delivery.objects.bulk_create(new_rows, batch_size=500)
    created = len(new_rows)

    return {"created": created, "removed": removed, "updated": updated, "window": [str(start), str(last)]}


@transaction.atomic
def cancel_basket(basket):
    """Stop a basket. Every future round that is still open is withdrawn —
    however far ahead it was rostered — and packed rounds still go out."""
    basket.status = Subscription.Status.CANCELLED
    basket.cancelled_at = timezone.now()
    basket.save(update_fields=["status", "cancelled_at"])
    build_roster(subscription=basket)


def start_from_package(user, address, package, start_date=None):
    """Copy a package into a real basket the customer can then edit."""
    start_date = start_date or timezone.localdate()
    basket = Subscription.objects.create(
        user=user,
        address=address,
        package=package,
        discount_percent=package.discount_percent,
        start_date=start_date,
    )
    for item in package.items.all():
        basket.lines.create(
            variant=item.variant,
            quantity=item.quantity,
            slot=item.slot,
            frequency=item.frequency,
            weekdays=item.weekdays,
            start_date=start_date,
            unit_price=item.variant.price,
        )
    build_roster(subscription=basket)
    return basket
