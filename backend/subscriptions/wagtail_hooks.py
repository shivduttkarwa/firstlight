from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from .models import Package


class PackageViewSet(SnippetViewSet):
    model = Package
    icon = "tasks"
    menu_label = "Packages"
    list_display = ["name", "serves", "discount_percent", "is_featured", "is_active"]
    add_to_admin_menu = True


register_snippet(PackageViewSet)
