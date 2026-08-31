from rest_framework.permissions import AllowAny
from wagtail.api.v2.router import WagtailAPIRouter
from wagtail.api.v2.views import PagesAPIViewSet
from wagtail.images.api.v2.views import ImagesAPIViewSet


class PublicPagesAPIViewSet(PagesAPIViewSet):
    """Storefront copy is public; the project default is IsAuthenticated."""

    permission_classes = [AllowAny]


class PublicImagesAPIViewSet(ImagesAPIViewSet):
    permission_classes = [AllowAny]


cms_router = WagtailAPIRouter("wagtailapi")
cms_router.register_endpoint("pages", PublicPagesAPIViewSet)
cms_router.register_endpoint("images", PublicImagesAPIViewSet)
