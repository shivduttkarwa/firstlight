from rest_framework import serializers

from .models import Category, Product, ProductVariant


def rendition_url(image, spec="fill-800x800|format-webp"):
    if not image:
        return None
    try:
        return image.get_rendition(spec).url
    except Exception:
        return None


class ProductVariantSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductVariant
        fields = ["id", "label", "quantity", "unit", "price", "compare_at_price", "sku"]


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug", "tagline"]


class ProductSerializer(serializers.ModelSerializer):
    variants = serializers.SerializerMethodField()
    category = CategorySerializer(read_only=True)
    image = serializers.SerializerMethodField()
    image_wide = serializers.SerializerMethodField()
    slots = serializers.SerializerMethodField()
    from_price = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "category", "kind", "animal", "tagline", "description",
            "badge", "fat_percent", "snf_percent", "shelf_life", "accent",
            "is_subscribable", "slots", "image", "image_wide", "from_price", "variants",
        ]

    def get_variants(self, obj):
        active = [v for v in obj.variants.all() if v.is_active]
        return ProductVariantSerializer(active, many=True).data

    def get_image(self, obj):
        return rendition_url(obj.image)

    def get_image_wide(self, obj):
        return rendition_url(obj.image, "fill-1200x800|format-webp")

    def get_slots(self, obj):
        return list(obj.slots)
