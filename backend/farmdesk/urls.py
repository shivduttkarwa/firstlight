from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("customers", views.CustomerViewSet, basename="farm-customer")
router.register("products", views.StaffProductViewSet, basename="farm-product")
router.register("packages", views.StaffPackageViewSet, basename="farm-package")

urlpatterns = [
    path("overview/", views.overview, name="farm-overview"),
    path("round/", views.RoundView.as_view(), name="farm-round"),
    path("round/mark/", views.MarkView.as_view(), name="farm-round-mark"),
    path("content/", views.ContentView.as_view(), name="farm-content"),
    path("categories/", views.categories, name="farm-categories"),
    path("roster/rebuild/", views.rebuild_roster, name="farm-roster-rebuild"),
    path("", include(router.urls)),
]
