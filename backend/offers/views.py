from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from orders.models import Wallet

from .services import OfferError, redeem


class RedeemView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "offer_redeem"

    def post(self, request):
        if request.user.is_staff:
            return Response({"detail": "Offer codes are for customer accounts."}, status=status.HTTP_403_FORBIDDEN)
        try:
            redemption = redeem(request.user, request.data.get("code"))
        except OfferError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "code": redemption.code,
                "amount": str(redemption.amount),
                "balance": str(Wallet.for_user(request.user).balance),
                "is_referral": redemption.is_referral,
            },
            status=status.HTTP_201_CREATED,
        )
