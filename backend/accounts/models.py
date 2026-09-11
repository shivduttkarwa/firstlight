import re
import secrets
from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models
from django.utils import timezone


MOBILE = re.compile(r"[6-9]\d{9}")


def normalise_phone(value):
    """A 10 digit Indian mobile, from '98765 43210', '+91-98765-43210' or '098765 43210'.

    Anything else comes back as '' rather than being trimmed into a different
    person's number.
    """
    raw = re.sub(r"[\s\-().]", "", str(value or ""))
    if raw.startswith("+91"):
        raw = raw[3:]
    elif len(raw) == 12 and raw.startswith("91"):
        raw = raw[2:]
    elif len(raw) == 11 and raw.startswith("0"):
        raw = raw[1:]
    return raw if raw.isascii() and MOBILE.fullmatch(raw) else ""


class UserManager(BaseUserManager):
    """Two ways in: staff sign in with a username and password, customers with a
    phone number and a one-time code. Both end up in this one table."""

    use_in_migrations = True

    def _create_user(self, username, password, **extra):
        username = (username or "").strip()
        if not username:
            raise ValueError("A username is required")
        if extra.get("phone"):
            extra["phone"] = normalise_phone(extra["phone"])
        else:
            extra["phone"] = None
        user = self.model(username=username, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_user(self, username, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(username, password, **extra)

    def create_superuser(self, username, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        if extra.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True")
        return self._create_user(username, password, **extra)

    def create_customer(self, phone, **extra):
        """A storefront customer. They never type a username, so it mirrors the
        phone number and the password is left unusable."""
        phone = normalise_phone(phone)
        if len(phone) != 10:
            raise ValueError("A 10 digit phone number is required")
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(username=phone, password=None, phone=phone, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    username = models.CharField(
        max_length=150,
        unique=True,
        validators=[UnicodeUsernameValidator()],
        help_text="Letters, digits and @/./+/-/_ only. Customers get their phone number here.",
    )
    phone = models.CharField(
        max_length=10,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="Customers sign in with this. Office staff do not need one.",
    )
    full_name = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    referral_code = models.CharField(max_length=12, unique=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self):
        label = self.full_name or self.username
        return f"{label} ({self.phone})" if self.phone else label

    def save(self, *args, **kwargs):
        if not self.referral_code:
            self.referral_code = f"FL{secrets.token_hex(3).upper()}"
        super().save(*args, **kwargs)

    def get_short_name(self):
        if self.full_name:
            return self.full_name.split(" ")[0]
        return self.phone or self.username


class OneTimeCode(models.Model):
    """A short lived login code. In DEBUG the code is echoed back by the API."""

    phone = models.CharField(max_length=10, db_index=True)
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    MAX_ATTEMPTS = 5
    TTL_MINUTES = 10

    @classmethod
    def issue(cls, phone):
        phone = normalise_phone(phone)
        cls.objects.filter(phone=phone, consumed_at__isnull=True).update(consumed_at=timezone.now())
        return cls.objects.create(
            phone=phone,
            code=f"{secrets.randbelow(1000000):06d}",
            expires_at=timezone.now() + timedelta(minutes=cls.TTL_MINUTES),
        )

    @property
    def is_usable(self):
        return (
            self.consumed_at is None
            and self.attempts < self.MAX_ATTEMPTS
            and self.expires_at > timezone.now()
        )

    def _live(self):
        return OneTimeCode.objects.filter(
            pk=self.pk, consumed_at__isnull=True, attempts__lt=self.MAX_ATTEMPTS, expires_at__gt=timezone.now()
        )

    def verify(self, code):
        """Compare and spend in one step. Counting a miss is a single conditional
        UPDATE, so parallel guesses cannot all slip in under the attempt limit."""
        if secrets.compare_digest(self.code, code):
            return self._live().update(consumed_at=timezone.now()) == 1
        self._live().update(attempts=models.F("attempts") + 1)
        return False


class Address(models.Model):
    class Label(models.TextChoices):
        HOME = "home", "Home"
        WORK = "work", "Work"
        OTHER = "other", "Other"

    user = models.ForeignKey(User, related_name="addresses", on_delete=models.CASCADE)
    label = models.CharField(max_length=10, choices=Label.choices, default=Label.HOME)
    contact_name = models.CharField(max_length=120)
    contact_phone = models.CharField(max_length=10)
    line1 = models.CharField("House / street", max_length=200)
    landmark = models.CharField(max_length=200, blank=True)
    village = models.CharField(max_length=120, default="Suratgarh")
    district = models.CharField(max_length=120, default="Sriganganagar")
    state = models.CharField(max_length=120, default="Rajasthan")
    pincode = models.CharField(max_length=6)
    delivery_note = models.CharField(max_length=240, blank=True, help_text="Gate code, where to leave the pot, dog on premises…")
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_default", "-created_at"]
        verbose_name_plural = "addresses"

    def __str__(self):
        return f"{self.line1}, {self.village} {self.pincode}"

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            Address.objects.filter(user=self.user).exclude(pk=self.pk).update(is_default=False)
