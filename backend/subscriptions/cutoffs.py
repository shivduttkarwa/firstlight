"""When a round is packed, and a customer's change can no longer reach it."""

from datetime import datetime, time, timedelta

from django.conf import settings
from django.utils import timezone

from catalog.models import Slot


def cutoff(day, slot):
    """The moment the round for ``day``/``slot`` stops taking changes (farm time)."""
    hour, minute = (int(part) for part in settings.SLOT_CUTOFFS[slot].split(":"))
    packed_on = day - timedelta(days=1) if slot == Slot.MORNING else day
    return timezone.make_aware(datetime.combine(packed_on, time(hour, minute)))


def is_locked(day, slot, now=None):
    return (now or timezone.now()) >= cutoff(day, slot)


def locked_slots(day, now=None):
    return [slot for slot in Slot.values if is_locked(day, slot, now)]


def too_late(day, slot):
    when = "the night before" if slot == Slot.MORNING else "the same day"
    label = dict(Slot.choices)[slot].split(" ")[0].lower()
    return (
        f"Too late to change the {label} round on {day:%d %b} — it closes at "
        f"{settings.SLOT_CUTOFFS[slot]} {when}."
    )
