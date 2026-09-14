#!/usr/bin/env bash
# Puts one commit live. On the server: sudo bash /srv/firstlight/app/deploy/deploy.sh [git-ref]
set -euo pipefail

APP=/srv/firstlight/app
WEB=/srv/firstlight/web
BUILD=/srv/firstlight/build
REF=${1:-origin/main}

as_app() { sudo -u firstlight -H -- "$@"; }

cd "$APP"

if [[ ${FIRSTLIGHT_CHECKED_OUT:-} != 1 ]]; then
  echo "==> Fetching $REF"
  as_app git -C "$APP" fetch --quiet --prune origin
  as_app git -C "$APP" reset --quiet --hard "$REF"
  # Carry on with the deploy.sh we just checked out, not the one bash already has open.
  FIRSTLIGHT_CHECKED_OUT=1 exec bash "$APP/deploy/deploy.sh" "$REF"
fi

echo "==> $(as_app git -C "$APP" log -1 --format='%h %s')"

echo "==> Backend"
cd "$APP/backend"
as_app .venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt
as_app .venv/bin/python manage.py check
as_app .venv/bin/python manage.py migrate --noinput
as_app .venv/bin/python manage.py collectstatic --noinput --verbosity 0

echo "==> Storefront"
cd "$APP/frontend"
as_app npm ci --no-audit --no-fund --loglevel=error
as_app env VITE_BASE=/ npm run --silent build -- --outDir "$BUILD" --emptyOutDir --logLevel warn

# Old chunks stay for two weeks, so a phone still showing the last release can load its lazy pages.
as_app mkdir -p "$WEB/assets"
as_app cp -r "$BUILD/assets/." "$WEB/assets/"
as_app find "$BUILD" -mindepth 1 -maxdepth 1 ! -name assets ! -name index.html -exec cp -r {} "$WEB/" \;
as_app cp "$BUILD/index.html" "$WEB/.index.html.new"
as_app mv -f "$WEB/.index.html.new" "$WEB/index.html"
as_app find "$WEB/assets" -type f -mtime +14 -delete

echo "==> Reloading the API"
systemctl reload-or-restart firstlight
sleep 3
if ! systemctl is-active --quiet firstlight; then
  journalctl -u firstlight -n 40 --no-pager
  echo "!! The API did not come back up." >&2
  exit 1
fi

echo "==> Live: $(as_app git -C "$APP" log -1 --format='%h %s')"
