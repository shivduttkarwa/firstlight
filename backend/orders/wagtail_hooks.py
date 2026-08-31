from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet, SnippetViewSetGroup

from .models import Delivery, Order


class DeliveryViewSet(SnippetViewSet):
    model = Delivery
    icon = "site"
    menu_label = "Delivery roster"
    list_display = ["date", "slot", "user", "variant", "quantity", "status"]
    list_filter = ["date", "slot", "status"]
    ordering = ["date", "slot"]


class OrderViewSet(SnippetViewSet):
    model = Order
    icon = "list-ul"
    menu_label = "One-off orders"
    list_display = ["reference", "user", "delivery_date", "slot", "total", "status"]
    list_filter = ["status", "slot"]


class FulfilmentGroup(SnippetViewSetGroup):
    menu_label = "Fulfilment"
    menu_icon = "site"
    items = (DeliveryViewSet, OrderViewSet)


register_snippet(FulfilmentGroup)
