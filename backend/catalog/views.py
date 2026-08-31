from rest_framework import viewsets
from rest_framework.permissions import AllowAny

from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class = ProductSerializer
    lookup_field = "slug"
    pagination_class = None
    filterset_fields = ["kind", "animal", "category__slug"]

    def get_queryset(self):
        return (
            Product.objects.filter(is_active=True)
            .select_related("category", "image")
            .prefetch_related("variants")
        )


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [AllowAny]
    serializer_class = CategorySerializer
    queryset = Category.objects.all()
    pagination_class = None
    lookup_field = "slug"
