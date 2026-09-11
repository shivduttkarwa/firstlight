from wagtail.permission_policies import ModelPermissionPolicy
from wagtail.permissions import register_permission_policy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet, SnippetViewSetGroup

from .models import Delivery, Order


class ReadOnlyPolicy(ModelPermissionPolicy):
    """Look, don't touch: a status edited here would skip the wallet entirely.
    Deliveries change through the farm desk, where charges and refunds happen."""

    def user_has_permission(self, user, action):
        if action in ("add", "change", "delete"):
            return False
        return super().user_has_permission(user, action)

    def user_has_any_permission(self, user, actions):
        return any(self.user_has_permission(user, action) for action in actions)


register_permission_policy(Delivery, ReadOnlyPolicy(Delivery))
register_permission_policy(Order, ReadOnlyPolicy(Order))


class ReadOnlySnippetViewSet(SnippetViewSet):
    inspect_view_enabled = True


class DeliveryViewSet(ReadOnlySnippetViewSet):
    model = Delivery
    icon = "site"
    menu_label = "Delivery roster"
    list_display = ["date", "slot", "user", "variant", "quantity", "status"]
    list_filter = ["date", "slot", "status"]
    ordering = ["date", "slot"]


class OrderViewSet(ReadOnlySnippetViewSet):
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
