from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from wagtail import urls as wagtail_urls
from wagtail.admin import urls as wagtailadmin_urls
from wagtail.documents import urls as wagtaildocs_urls

from accounts.views import AddressViewSet, LogoutView, MeView, RequestOTPView, StaffLoginView, VerifyOTPView
from catalog.views import CategoryViewSet, ProductViewSet
from orders.views import DeliveryViewSet, OrderViewSet, WalletView
from subscriptions.views import PackageViewSet, SubscriptionLineViewSet, SubscriptionViewSet

from .api import cms_router
from .views import farm_info

router = DefaultRouter()
router.register("products", ProductViewSet, basename="product")
router.register("categories", CategoryViewSet, basename="category")
router.register("packages", PackageViewSet, basename="package")
router.register("addresses", AddressViewSet, basename="address")
router.register("subscriptions", SubscriptionViewSet, basename="subscription")
router.register("basket-lines", SubscriptionLineViewSet, basename="basket-line")
router.register("deliveries", DeliveryViewSet, basename="delivery")
router.register("orders", OrderViewSet, basename="order")

api_patterns = [
    path("auth/otp/request/", RequestOTPView.as_view(), name="otp-request"),
    path("auth/otp/verify/", VerifyOTPView.as_view(), name="otp-verify"),
    path("auth/staff/login/", StaffLoginView.as_view(), name="staff-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("auth/me/", MeView.as_view(), name="me"),
    path("wallet/", WalletView.as_view(), name="wallet"),
    path("farm-info/", farm_info, name="farm-info"),
    path("farm/", include("farmdesk.urls")),
    path("", include(router.urls)),
]

urlpatterns = [
    path("api/cms/", cms_router.urls),
    path("api/", include(api_patterns)),
    path("django-admin/", admin.site.urls),
    path("admin/", include(wagtailadmin_urls)),
    path("documents/", include(wagtaildocs_urls)),
]

if settings.DEBUG:
    from django.conf.urls.static import static
    from django.contrib.staticfiles.urls import staticfiles_urlpatterns

    urlpatterns += staticfiles_urlpatterns()
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [path("", include(wagtail_urls))]
