"""The Wagtail admin, dressed as Firstlight and given a dashboard worth opening.

Wagtail's stock home page is about pages — recent edits, moderation, upgrade
notices. None of that is what the farm wants at 5am. These hooks replace it
with the round, the shed and the money, using the same queries the farm desk
API already answers with.
"""

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.templatetags.static import static
from django.utils import timezone
from django.utils.html import format_html
from wagtail import hooks
from wagtail.admin.ui.components import Component

from accounts.models import User
from orders.models import Delivery, Wallet
from subscriptions.models import Subscription

LOW_WALLET = Decimal("200")


@hooks.register("insert_global_admin_css")
def firstlight_admin_css():
    return format_html('<link rel="stylesheet" href="{}">', static("firstlight/admin.css"))


def _slot_counts(day):
    """items / stops / done / value for each slot on a given day."""
    out = {}
    for slot in ("morning", "evening"):
        rows = Delivery.objects.filter(date=day, slot=slot)
        done = rows.filter(status=Delivery.Status.DELIVERED).count()
        items = rows.count()
        out[slot] = {
            "items": items,
            "stops": rows.values("address_id").distinct().count(),
            "done": done,
            "percent": round(done / items * 100) if items else 0,
            "value": rows.aggregate(v=Sum("total"))["v"] or Decimal("0"),
        }
    return out


class StatsPanel(Component):
    """The four numbers the farm checks first."""

    order = 5
    template_name = "wagtailadmin/home/fl_stats.html"

    def __init__(self, request):
        self.request = request

    def get_context_data(self, parent_context):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        month = Delivery.objects.filter(
            date__gte=month_start, status=Delivery.Status.DELIVERED
        ).aggregate(count=Count("id"), value=Sum("total"))
        low = (
            Wallet.objects.filter(balance__lt=LOW_WALLET, user__subscriptions__status="active")
            .distinct()
            .count()
        )
        return {
            "customers": User.objects.filter(is_staff=False).count(),
            "baskets": Subscription.objects.filter(status="active").count(),
            "delivered": month["count"] or 0,
            "taken": month["value"] or Decimal("0"),
            "low": low,
        }


class RoundPanel(Component):
    """Today's two rounds, and how far through them the farm is."""

    order = 10
    template_name = "wagtailadmin/home/fl_round.html"

    def __init__(self, request):
        self.request = request

    def get_context_data(self, parent_context):
        today = timezone.localdate()
        slots = _slot_counts(today)
        return {
            "today": today,
            "morning": slots["morning"],
            "evening": slots["evening"],
            "total_value": slots["morning"]["value"] + slots["evening"]["value"],
        }


class TomorrowPanel(Component):
    """What has to come out of the shed tomorrow, by product and slot."""

    order = 20
    template_name = "wagtailadmin/home/fl_tomorrow.html"

    def __init__(self, request):
        self.request = request

    def get_context_data(self, parent_context):
        tomorrow = timezone.localdate() + timedelta(days=1)
        rows = (
            Delivery.objects.filter(date=tomorrow)
            .values("variant__product__name", "variant__label", "slot")
            .annotate(packs=Sum("quantity"))
            .order_by("slot", "variant__product__name")
        )
        return {"tomorrow": tomorrow, "rows": rows}


class LowWalletsPanel(Component):
    """Subscribers who will run dry before the rider reaches them."""

    order = 30
    template_name = "wagtailadmin/home/fl_wallets.html"

    def __init__(self, request):
        self.request = request

    def get_context_data(self, parent_context):
        wallets = (
            Wallet.objects.filter(balance__lt=LOW_WALLET, user__subscriptions__status="active")
            .select_related("user")
            .distinct()
            .order_by("balance")[:8]
        )
        return {"wallets": wallets, "threshold": LOW_WALLET}


@hooks.register("construct_homepage_panels", order=1000)
def firstlight_panels(request, panels):
    """Clear Wagtail's page-centric panels and put the farm's day up instead."""
    panels[:] = [
        StatsPanel(request),
        RoundPanel(request),
        TomorrowPanel(request),
        LowWalletsPanel(request),
    ]


@hooks.register("construct_homepage_summary_items", order=1000)
def firstlight_summary(request, items):
    """Page, image and document counts are not what this office needs."""
    items[:] = []
