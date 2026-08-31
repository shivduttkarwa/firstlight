from rest_framework import serializers

from .models import Address, User, normalise_phone


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        phone = normalise_phone(super().to_internal_value(data))
        if len(phone) != 10 or not phone.isdigit():
            raise serializers.ValidationError("Enter a valid 10 digit Indian mobile number.")
        return phone


class OTPRequestSerializer(serializers.Serializer):
    phone = PhoneField()


class OTPVerifySerializer(serializers.Serializer):
    phone = PhoneField()
    code = serializers.CharField(min_length=6, max_length=6)
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True)


class UserSerializer(serializers.ModelSerializer):
    wallet_balance = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "phone", "full_name", "email", "referral_code", "date_joined", "wallet_balance"]
        read_only_fields = ["id", "phone", "referral_code", "date_joined"]

    def get_wallet_balance(self, obj):
        wallet = getattr(obj, "wallet", None)
        return str(wallet.balance) if wallet else "0.00"


class AddressSerializer(serializers.ModelSerializer):
    contact_phone = PhoneField()

    class Meta:
        model = Address
        fields = [
            "id", "label", "contact_name", "contact_phone", "line1", "landmark",
            "village", "district", "state", "pincode", "delivery_note", "is_default",
        ]

    def validate_pincode(self, value):
        if not (value.isdigit() and len(value) == 6):
            raise serializers.ValidationError("Enter a valid 6 digit PIN code.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        if not user.addresses.exists():
            validated_data["is_default"] = True
        return Address.objects.create(user=user, **validated_data)
