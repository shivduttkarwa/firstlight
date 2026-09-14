"""Settings for the Firstlight milk subscription backend."""

import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

PROJECT_DIR = Path(__file__).resolve().parent
BASE_DIR = PROJECT_DIR.parent

load_dotenv(BASE_DIR / ".env")


def env_list(name, default=""):
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_bool(name, default=False):
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in ("1", "true", "yes", "on")


# Safe by default: a server that forgets its .env runs locked down, not wide open.
DEBUG = env_bool("DJANGO_DEBUG", False)
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY") or ("insecure-dev-key" if DEBUG else "")
if not SECRET_KEY:
    raise ImproperlyConfigured("Set DJANGO_SECRET_KEY: it signs every login token.")
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")


INSTALLED_APPS = [
    "website",
    "farmdesk",
    "accounts",
    "catalog",
    "subscriptions",
    "orders",
    "offers",
    "wagtail.contrib.forms",
    "wagtail.contrib.redirects",
    "wagtail.embeds",
    "wagtail.sites",
    "wagtail.users",
    "wagtail.snippets",
    "wagtail.documents",
    "wagtail.images",
    "wagtail.search",
    "wagtail.admin",
    "wagtail.api.v2",
    "wagtail",
    "modelcluster",
    "taggit",
    "django_filters",
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "wagtail.contrib.redirects.middleware.RedirectMiddleware",
]

ROOT_URLCONF = "firstlight.urls"
WSGI_APPLICATION = "firstlight.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": dj_database_url.config(
        default=os.getenv("DATABASE_URL", "postgres://postgres:postgres@127.0.0.1:5432/firstlight"),
        conn_max_age=600,
        conn_health_checks=True,
    )
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATICFILES_FINDERS = [
    "django.contrib.staticfiles.finders.FileSystemFinder",
    "django.contrib.staticfiles.finders.AppDirectoriesFinder",
]
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
STATIC_URL = "/static/"

MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL = "/media/"

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATA_UPLOAD_MAX_NUMBER_FIELDS = 10_000


# --- Wagtail -----------------------------------------------------------------

WAGTAIL_SITE_NAME = "Firstlight"
WAGTAILADMIN_BASE_URL = os.getenv("WAGTAILADMIN_BASE_URL", "http://localhost:8000")
WAGTAILSEARCH_BACKENDS = {"default": {"BACKEND": "wagtail.search.backends.database"}}
WAGTAILDOCS_EXTENSIONS = ["csv", "docx", "pdf", "txt", "xlsx"]
WAGTAILIMAGES_IMAGE_MODEL = "wagtailimages.Image"
WAGTAIL_APPEND_SLASH = True


# --- API ---------------------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_RENDERER_CLASSES": (
        ("rest_framework.renderers.JSONRenderer", "rest_framework.renderers.BrowsableAPIRenderer")
        if DEBUG
        else ("rest_framework.renderers.JSONRenderer",)
    ),
    # Per client IP, on the endpoints that can be hammered without an account.
    "DEFAULT_THROTTLE_RATES": {
        "otp_request": os.getenv("THROTTLE_OTP_REQUEST", "20/hour"),
        "otp_verify": os.getenv("THROTTLE_OTP_VERIFY", "40/hour"),
        "staff_login": os.getenv("THROTTLE_STAFF_LOGIN", "10/hour"),
        "offer_redeem": os.getenv("THROTTLE_OFFER_REDEEM", "30/hour"),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

CORS_ALLOWED_ORIGINS = env_list("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS


# --- Firstlight domain settings ----------------------------------------------

FARM = {
    "brand": "Firstlight",
    "village": "11 SHPD",
    "post": "8 SHPD",
    "tehsil": "Suratgarh",
    "district": "Sriganganagar",
    "state": "Rajasthan",
    "country": "India",
}

# How many days ahead the delivery roster is generated.
DELIVERY_ROSTER_DAYS = 14
# When a round is packed and stops taking changes: the morning round at this
# time the evening before, the evening round at this time the same day.
SLOT_CUTOFFS = {"morning": "21:00", "evening": "13:00"}

# No SMS gateway yet. These echo the sign-in code on screen, and let customers
# add wallet money themselves — both fine for a demo, never for real money.
OTP_SHOW_CODE = env_bool("OTP_SHOW_CODE", DEBUG)
WALLET_SELF_TOPUP = env_bool("WALLET_SELF_TOPUP", DEBUG)
# Rupees for a household joining on a neighbour's code, and again for the neighbour.
REFERRAL_CREDIT = os.getenv("REFERRAL_CREDIT", "200")
# Per phone number, on top of the per-IP throttles above.
OTP_CODES_PER_HOUR = int(os.getenv("OTP_CODES_PER_HOUR", "50" if DEBUG else "5"))
OTP_FAILURES_PER_DAY = int(os.getenv("OTP_FAILURES_PER_DAY", "100" if DEBUG else "15"))

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

if not DEBUG:
    # TLS ends at the proxy (nginx); trust its header so redirects and cookies know.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = int(os.getenv("DJANGO_HSTS_SECONDS", "31536000"))
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_REFERRER_POLICY = "same-origin"
