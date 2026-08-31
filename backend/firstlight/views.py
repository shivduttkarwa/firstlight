from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from catalog.models import Slot


@api_view(["GET"])
@permission_classes([AllowAny])
def farm_info(request):
    """Everything the storefront needs about where the milk comes from."""
    return Response(
        {
            "farm": settings.FARM,
            "address_lines": [
                f"Village {settings.FARM['village']}, Post {settings.FARM['post']}",
                f"Tehsil {settings.FARM['tehsil']}, District {settings.FARM['district']}",
                f"{settings.FARM['state']}, {settings.FARM['country']}",
            ],
            "slots": [{"value": value, "label": label} for value, label in Slot.choices],
            "cutoffs": settings.SLOT_CUTOFFS,
        }
    )
