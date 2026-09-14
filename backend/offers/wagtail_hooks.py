from wagtail.permissions import register_permission_policy
from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet, SnippetViewSetGroup

from orders.wagtail_hooks import ReadOnlyPolicy, ReadOnlySnippetViewSet

from .models import Coupon, Redemption

register_permission_policy(Redemption, ReadOnlyPolicy(Redemption))


class CouponViewSet(SnippetViewSet):
    model = Coupon
    icon = "tag"
    menu_label = "Offer codes"
    list_display = ["code", "title", "kind", "is_active", "ends_on"]
    list_filter = ["kind", "is_active"]


class RedemptionViewSet(ReadOnlySnippetViewSet):
    model = Redemption
    icon = "list-ul"
    menu_label = "Codes used"
    list_display = ["created_at", "code", "user", "amount", "referrer_paid_at"]
    list_filter = ["is_referral"]


class OffersGroup(SnippetViewSetGroup):
    menu_label = "Offers"
    menu_icon = "tag"
    items = (CouponViewSet, RedemptionViewSet)


register_snippet(OffersGroup)
