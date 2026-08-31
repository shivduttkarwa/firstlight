"""Turning baskets into a day-by-day delivery roster."""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from orders.models import Delivery

from .models import DayOverride, Subscription

# Fields a scheduled delivery copies from its line. If the customer edits the
# basket, rows we have not dispatched yet must follow.
MIRRORED = ("slot", "variant_id", "unit_price")


def line_total(unit_price, quantity, discount_percent):
    gross = unit_price * quantity
    if discount_percent:
        gross -= gross * discount_percent / Decimal("100")
    return gross.quantize(Decimal("0.01"))


@transaction.atomic
def build_roster(days=None, from_date=None, subscription=None):
    """Create Delivery rows for active baskets over the coming window.

    Safe to run repeatedly. Rows for days the customer has since skipped or
    paused are withdrawn while still 'scheduled', and rows that survive are
    brought back in line with the basket as it now stands.

    Pass ``subscription`` to re-roster one basket instead of the whole book.
    """
    days = days or getattr(settings, "DELIVERY_ROSTER_DAYS", 14)
    start = from_date or timezone.localdate()
    window = [start + timedelta(days=i) for i in range(days)]
    last = window[-1]

    if subscription is not None:
        baskets = [subscription]
    else:
        baskets = list(
            Subscription.objects.filter(
                status__in=[Subscription.Status.ACTIVE, Subscription.Status.PAUSED]
            )
            .select_related("address", "user", "package")
            .prefetch_related("lines__variant__product")
        )

    # One query for every override in the window rather than one per line per day.
    overrides = defaultdict(dict)
    for line_id, day, quantity in DayOverride.objects.filter(
        line__subscription__in=baskets, date__gte=start, date__lte=last
    ).values_list("line_id", "date", "quantity"):
        overrides[line_id][day] = quantity

    created = removed = updated = 0

    for basket in baskets:
        discount = basket.discount_percent or Decimal("0")

        for line in basket.lines.all():
            wanted = {}
            if line.is_active:
                for day in window:
                    quantity = line.quantity_on(day, overrides)
                    if quantity:
                        wanted[day] = quantity

            rows = list(Delivery.objects.filter(line=line, date__gte=start, date__lte=last))

            withdrawn = [r for r in rows if r.status == Delivery.Status.SCHEDULED and r.date not in wanted]
            if withdrawn:
                Delivery.objects.filter(pk__in=[r.pk for r in withdrawn]).delete()
                removed += len(withdrawn)

            dropped = {r.pk for r in withdrawn}
            kept = [r for r in rows if r.pk not in dropped]

            for row in kept:
                if row.status != Delivery.Status.SCHEDULED:
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

            have = {r.date for r in kept}
            for day, quantity in sorted(wanted.items()):
                if day in have:
                    continue
                Delivery.objects.create(
                    line=line,
                    subscription=basket,
                    user=basket.user,
                    address=basket.address,
                    variant=line.variant,
                    date=day,
                    slot=line.slot,
                    quantity=quantity,
                    unit_price=line.unit_price,
                    total=line_total(line.unit_price, quantity, discount),
                )
                created += 1

    return {"created": created, "removed": removed, "updated": updated, "window": [str(start), str(last)]}


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
