from wagtail.snippets.models import register_snippet
from wagtail.snippets.views.snippets import SnippetViewSet

from .models import Category, Product


class ProductViewSet(SnippetViewSet):
    model = Product
    icon = "pick"
    menu_label = "Products"
    list_display = ["name", "kind", "animal", "is_active", "sort_order"]
    list_filter = ["kind", "animal", "is_active"]
    search_fields = ["name", "tagline"]
    add_to_admin_menu = True


class CategoryViewSet(SnippetViewSet):
    model = Category
    icon = "tag"
    menu_label = "Categories"
    list_display = ["name", "slug", "sort_order"]


register_snippet(ProductViewSet)
register_snippet(CategoryViewSet)
