#!/usr/bin/env bash
# Sets up a fresh Ubuntu 24.04 server; safe to re-run. See "Deploying" in README.md.
set -euo pipefail

REPO=${REPO:-https://github.com/shivduttkarwa/firstlight.git}
DOMAIN=${DOMAIN:-}
EMAIL=${EMAIL:-}

HOME_DIR=/srv/firstlight
APP=$HOME_DIR/app
ENV_FILE=$APP/backend/.env
ADMIN_PASSWORD_FILE=/root/firstlight-admin-password
export DEBIAN_FRONTEND=noninteractive

[[ $EUID -eq 0 ]] || { echo "Run it with sudo." >&2; exit 1; }
cd /tmp

as_app() { sudo -u firstlight -H -- "$@"; }

set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    echo "$1=$2" >>"$ENV_FILE"
  fi
}

echo "==> System"
timedatectl set-timezone Asia/Kolkata
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Packages"
apt-get update -q
apt-get install -y -q ca-certificates curl git nginx python3-venv postgresql-common
if [[ ! -f /etc/apt/sources.list.d/pgdg.list && ! -f /etc/apt/sources.list.d/pgdg.sources ]]; then
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
fi
apt-get install -y -q postgresql-18
if ! node --version 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

echo "==> App user and code"
id firstlight &>/dev/null || useradd --system --create-home --home-dir "$HOME_DIR" --shell /bin/bash firstlight
chmod 755 "$HOME_DIR"
[[ -d $APP/.git ]] || as_app git clone --quiet "$REPO" "$APP"
as_app git -C "$APP" fetch --quiet --prune origin
as_app git -C "$APP" reset --quiet --hard origin/main

echo "==> Database"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = 'firstlight'" | grep -q 1; then
  sudo -u postgres createuser firstlight
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'firstlight'" | grep -q 1; then
  sudo -u postgres createdb --owner firstlight firstlight
fi

echo "==> Settings ($ENV_FILE)"
if [[ ! -f $ENV_FILE ]]; then
  as_app touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  cat >>"$ENV_FILE" <<EOF
DJANGO_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')
# Peer login over the local socket: the firstlight user needs no database password.
DATABASE_URL=postgres://firstlight@%2Fvar%2Frun%2Fpostgresql/firstlight
# No SMS or payment gateway yet, so a demo needs both. Turn them off before real money.
OTP_SHOW_CODE=true
WALLET_SELF_TOPUP=true
EOF
fi
if [[ -n $DOMAIN ]]; then
  host=$DOMAIN
  origin=https://$DOMAIN
  sed -i '/^DJANGO_SSL_REDIRECT=/d; /^DJANGO_HSTS_SECONDS=/d' "$ENV_FILE"
else
  host=$(curl -fsS https://checkip.amazonaws.com)
  origin=http://$host
  set_env DJANGO_SSL_REDIRECT false
  set_env DJANGO_HSTS_SECONDS 0
fi
set_env DJANGO_DEBUG false
set_env DJANGO_ALLOWED_HOSTS "$host"
set_env FRONTEND_ORIGINS "$origin"
set_env WAGTAILADMIN_BASE_URL "$origin"
chown firstlight:firstlight "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "==> API service and nightly roster"
[[ -d $APP/backend/.venv ]] || as_app python3 -m venv "$APP/backend/.venv"
install -m 644 "$APP/deploy/firstlight.service" /etc/systemd/system/firstlight.service
install -m 644 "$APP/deploy/firstlight.cron" /etc/cron.d/firstlight
systemctl daemon-reload
systemctl enable --quiet firstlight

bash "$APP/deploy/deploy.sh"

echo "==> Catalogue and staff login"
if [[ ! -f $ADMIN_PASSWORD_FILE ]]; then
  (umask 077 && python3 -c 'import secrets; print(secrets.token_urlsafe(12))' >"$ADMIN_PASSWORD_FILE")
fi
cd "$APP/backend"
as_app env SEED_ADMIN_PASSWORD="$(cat "$ADMIN_PASSWORD_FILE")" .venv/bin/python manage.py seed

echo "==> Web server"
sed "s|__SERVER_NAME__|${DOMAIN:-_}|" "$APP/deploy/nginx.conf" >/etc/nginx/sites-available/firstlight
ln -sf /etc/nginx/sites-available/firstlight /etc/nginx/sites-enabled/firstlight
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
systemctl reload nginx

if [[ -n $DOMAIN ]]; then
  echo "==> HTTPS for $DOMAIN"
  apt-get install -y -q certbot python3-certbot-nginx
  if [[ -n $EMAIL ]]; then contact=(-m "$EMAIL"); else contact=(--register-unsafely-without-email); fi
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect --keep-until-expiring "${contact[@]}"
fi

echo
echo "Firstlight is up at $origin"
echo "  Farm desk:  $origin/farm   admin / $(cat "$ADMIN_PASSWORD_FILE")   (also in $ADMIN_PASSWORD_FILE)"
[[ -n $DOMAIN ]] || echo "  Plain http: the farm desk works, but /admin (Wagtail) needs a domain with HTTPS to sign in."
