from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from orders.models import Wallet

from .models import Address, OneTimeCode, User
from .serializers import AddressSerializer, OTPRequestSerializer, OTPVerifySerializer, UserSerializer


def tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {"refresh": str(refresh), "access": str(refresh.access_token)}


class RequestOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]

        recent = OneTimeCode.objects.filter(phone=phone, consumed_at__isnull=True).first()
        if recent and (timezone.now() - recent.created_at).total_seconds() < 30:
            return Response(
                {"detail": "A code was just sent. Please wait a moment before asking for another."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        otp = OneTimeCode.issue(phone)
        payload = {"detail": f"A 6 digit code is on its way to {phone}.", "expires_in": OneTimeCode.TTL_MINUTES * 60}
        if settings.DEBUG:
            # No SMS gateway wired up yet — surface the code so the app is testable.
            payload["dev_code"] = otp.code
        return Response(payload, status=status.HTTP_200_OK)


class VerifyOTPView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        phone = serializer.validated_data["phone"]
        code = serializer.validated_data["code"]

        otp = OneTimeCode.objects.filter(phone=phone, consumed_at__isnull=True).first()
        if not otp or not otp.is_usable:
            return Response({"detail": "That code has expired. Ask for a new one."}, status=status.HTTP_400_BAD_REQUEST)

        if otp.code != code:
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            left = max(OneTimeCode.MAX_ATTEMPTS - otp.attempts, 0)
            return Response(
                {"detail": f"That code doesn't match. {left} attempt(s) left."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp.consume()
        user = User.objects.filter(phone=phone).first()
        created = user is None
        if created:
            user = User.objects.create_customer(phone)
        elif user.is_staff:
            # Staff accounts are reached with a username and password, not a code.
            return Response(
                {"detail": "This number belongs to a staff account. Please sign in through the admin."},
                status=status.HTTP_403_FORBIDDEN,
            )
        name = serializer.validated_data.get("full_name")
        if name and not user.full_name:
            user.full_name = name
            user.save(update_fields=["full_name"])
        Wallet.for_user(user)

        return Response(
            {"user": UserSerializer(user).data, "tokens": tokens_for(user), "is_new": created},
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AddressViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AddressSerializer
    pagination_class = None

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    @action(detail=True, methods=["post"])
    def make_default(self, request, pk=None):
        address = self.get_object()
        address.is_default = True
        address.save()
        return Response(self.get_serializer(address).data)


class StaffLoginView(APIView):
    """Username and password, for the people who run the farm."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        username = (request.data.get("username") or "").strip()
        password = request.data.get("password") or ""
        if not username or not password:
            return Response(
                {"detail": "Enter your username and password."}, status=status.HTTP_400_BAD_REQUEST
            )

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response(
                {"detail": "That username and password do not match."}, status=status.HTTP_400_BAD_REQUEST
            )
        if not user.is_staff:
            return Response({"detail": "This account is not a farm account."}, status=status.HTTP_403_FORBIDDEN)

        return Response(
            {
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "full_name": user.full_name,
                    "is_staff": True,
                },
                "tokens": tokens_for(user),
            }
        )
