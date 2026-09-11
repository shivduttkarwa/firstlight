from decimal import Decimal, InvalidOperation


def parse_amount(raw, low=Decimal("1"), high=Decimal("50000")):
    """A rupee amount sent by a client, or None if it is not one we should accept:
    a finite number with at most two decimals, between ``low`` and ``high``."""
    try:
        amount = Decimal(str(raw).strip())
    except (InvalidOperation, TypeError, ValueError):
        return None
    if not amount.is_finite() or amount.as_tuple().exponent < -2:
        return None
    if amount < low or amount > high:
        return None
    return amount.quantize(Decimal("0.01"))
