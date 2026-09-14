from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import User
from orders.models import Delivery, Wallet
from subscriptions.models import Subscription

from .models import Coupon, Redemption, normalise_code


class OfferError(Exception):
    pass


def rupees(amount):
    return f"₹{amount:,.0f}"


def has_had_delivery(user):
    return Delivery.objects.filter(user=user, status=Delivery.Status.DELIVERED).exists()


@transaction.atomic
def redeem(user, raw_code):
    """Credit a household's wallet for an offer code or a neighbour's referral code."""
    code = normalise_code(raw_code)
    if not code:
        raise OfferError("Enter a code.")
    wallet = Wallet.for_user(user)
    # Holding the wallet row makes a double tap wait, then fail the "already used" check.
    Wallet.objects.select_for_update().get(pk=wallet.pk)

    coupon = Coupon.objects.select_related("variant").filter(code=code).first()
    if coupon:
        return _redeem_coupon(user, wallet, coupon)
    referrer = User.objects.filter(referral_code=code, is_staff=False, is_active=True).first()
    if referrer:
        return _redeem_referral(user, wallet, referrer)
    raise OfferError("That code isn't one of ours. Check the spelling and try again.")


def _redeem_coupon(user, wallet, coupon):
    if not coupon.is_active or (coupon.ends_on and coupon.ends_on < timezone.localdate()):
        raise OfferError(f"{coupon.code} has ended.")
    if Redemption.objects.filter(user=user, coupon=coupon).exists():
        raise OfferError(f"You've already used {coupon.code}.")
    if coupon.new_customers_only and has_had_delivery(user):
        raise OfferError(f"{coupon.code} is for households new to Firstlight.")

    monthly = Decimal("0")
    if coupon.kind == Coupon.Kind.PERCENT_OF_MONTH or coupon.min_monthly:
        basket = Subscription.objects.filter(user=user).exclude(status=Subscription.Status.CANCELLED).first()
        if basket is None:
            raise OfferError(f"Start a basket first, then apply {coupon.code}.")
        monthly = basket.monthly_estimate()
        if monthly < coupon.min_monthly:
            raise OfferError(
                f"{coupon.code} needs a basket of {rupees(coupon.min_monthly)} a month. Yours comes to {rupees(monthly)}."
            )

    if coupon.kind == Coupon.Kind.PERCENT_OF_MONTH:
        amount = monthly * coupon.value / Decimal("100")
    elif coupon.kind == Coupon.Kind.PACK:
        amount = coupon.variant.price
    else:
        amount = coupon.value
    if coupon.max_credit is not None:
        amount = min(amount, coupon.max_credit)
    amount = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if amount <= 0:
        raise OfferError(f"Nothing is scheduled in your basket yet, so {coupon.code} has nothing to credit.")

    wallet.credit(amount, f"Offer {coupon.code}: {coupon.title}", ref=f"offer:{coupon.code}")
    return Redemption.objects.create(user=user, coupon=coupon, code=coupon.code, amount=amount)


def _redeem_referral(user, wallet, referrer):
    if referrer.pk == user.pk:
        raise OfferError("That's your own code. Share it with a neighbour instead.")
    if Redemption.objects.filter(user=user, is_referral=True).exists():
        raise OfferError("You've already joined with a neighbour's code.")
    if has_had_delivery(user):
        raise OfferError("Neighbour codes are for households new to Firstlight.")

    amount = Decimal(settings.REFERRAL_CREDIT).quantize(Decimal("0.01"))
    wallet.credit(amount, "Welcome credit: neighbour's code", ref=f"referral:{referrer.referral_code}")
    return Redemption.objects.create(
        user=user,
        is_referral=True,
        referrer=referrer,
        code=referrer.referral_code,
        amount=amount,
        referrer_amount=amount,
    )


@transaction.atomic
def pay_referrer(user):
    """Credit whoever referred this household, once, when its first delivery is charged."""
    pending = (
        Redemption.objects.select_for_update()
        .filter(user=user, is_referral=True, referrer__isnull=False, referrer_paid_at__isnull=True)
        .first()
    )
    if pending is None:
        return None
    pending.referrer_paid_at = timezone.now()
    pending.save(update_fields=["referrer_paid_at"])
    return Wallet.for_user(pending.referrer).credit(
        pending.referrer_amount, "Referral: your neighbour's first delivery", ref=f"referral:{pending.pk}"
    )
