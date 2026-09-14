# AGENTS.md — Firstlight

Guide for AI agents working in this repo. Read this first; `README.md` has the longer
human-facing story (domain model, API list, design notes).

## What this is

A milk-subscription app for **one farm** in Suratgarh, Sriganganagar (Rajasthan, India).
Customers keep a standing basket of cow/buffalo milk, ghee, curd and chhach delivered on a
morning (5.30–8.00 am) and evening (5.00–7.30 pm) round, paid from a prepaid wallet.

Two apps, one codebase, one API:

- **Storefront** (`/`) — customers. Mobile-first PWA with bottom tabs; a full desktop
  layout from 900px.
- **Farm desk** (`/farm`) — staff. The rider's round on a phone, the office on a desktop.
  No Wagtail vocabulary in its UI.

## Stack

| | |
|---|---|
| Backend | Django 6.1, Wagtail 8, DRF 3.18, simplejwt (+ token blacklist), PostgreSQL 18, whitenoise |
| Frontend | React 18 + TypeScript + Vite 6, react-router 6, zustand, framer-motion. **No UI kit** — hand-written CSS design system |
| Time zone | `Asia/Kolkata`. Always `timezone.localdate()` / `timezone.now()`, never `date.today()` |

## Layout

```
backend/
  firstlight/     settings.py (env-driven), urls.py, api.py (Wagtail CMS API), testing.py (test builders)
  accounts/       User (customers: phone+OTP; staff: username+password — one table), Address, OneTimeCode
  catalog/        Category, Product, ProductVariant (pack size + price), Slot (morning/evening)
  subscriptions/  Package, Subscription (the basket), SubscriptionLine, DayOverride
                  services.py  build_roster / ensure_roster / cancel_basket / start_from_package
                  cutoffs.py   when a round is "packed" and stops taking changes
  orders/         Delivery (roster rows), Wallet + WalletTransaction, Order (one-off, read-only for now)
                  money.py     parse_amount — use it for every rupee value from a client
  offers/         Coupon (farm-made codes), Redemption; services.py redeem / pay_referrer
  farmdesk/       staff-only API (IsFarmStaff): round, mark, overview, customers, products, content
  website/        Wagtail HomePage/StandardPage, seed command, admin skin (templates/, static/)
frontend/src/
  App.tsx         routes + shells (CustomerShell, AuthShell, FarmShell — farm pages lazy-loaded)
  lib/api.ts      fetch wrapper (JWT, refresh, errors) + all API types
  lib/format.ts   money/date helpers (parseISO/toISO are local-date safe)
  lib/nav.ts      safeNext() for ?next= redirects
  store/useStore.ts  useAuth (user/staff/baskets/addresses/bootstrap), toasts
  components/Shell.tsx   AppBar (phone bar + desktop breadcrumb), SiteHeader, SiteFooter, TabBar, FarmNav
  components/ui.tsx      Sheet, Toaster, Icon, Skeletons, Empty, Reveal, PageFade, Spinner
  components/Confirm.tsx ask() — the themed confirm dialog
  styles/tokens.css  design tokens; app.css the whole design system; base.css resets
deploy/           setup.sh (one-time server), deploy.sh (each release), nginx.conf, firstlight.service, firstlight.cron
deploy.ps1        push main and put it live on the server
```

## Run it (Windows, PowerShell or Git Bash)

```bash
# API on :8000
cd backend && .venv/Scripts/python.exe manage.py runserver
# apps on :5173 (Vite proxies /api and /media to :8000)
cd frontend && npm run dev
```

`start.ps1` opens both in their own windows.

- **Database:** PostgreSQL 18 on **port 5432**. The machine also runs PG 13 on 5433, and `psql` is not on PATH.
- **Settings:** come from `backend/.env`, which is gitignored; `.env.example` lists the keys.
- **Staff login:** `admin` / `firstlight` at `/farm/login`, local only.
- **Customer login:** any Indian mobile number. With `OTP_SHOW_CODE` on (DEBUG), the code is shown on screen.
- **Local demo customers:** 9811100001–9811100004. They exist in the dev database only; the seed doesn't create them.

## Checks before you finish

```bash
cd backend  && .venv/Scripts/python.exe manage.py test --noinput      # 47+ tests, needs Postgres
cd backend  && .venv/Scripts/python.exe manage.py makemigrations --check --dry-run
cd frontend && npx tsc --noEmit && npm run build
```

CI (`.github/workflows/tests.yml`) runs all of this on every push with **DEBUG off**. `deploy.yml`
publishes the storefront to GitHub Pages; it has no backend there, so it can only browse.

## Rules of the domain (do not break these)

- **One basket per household.** `POST /subscriptions/` refuses a second, and `from-package`
  answers 409 unless `replace: true`, which cancels the old basket first. The frontend uses `baskets[0]`.
- **Never hard-delete history.**
  - Baskets are cancelled, not deleted: the subscription API has no DELETE.
  - Removing a line sets `is_active=False`.
  - `Delivery.line`, `Delivery.subscription` and `Delivery.address` use `RESTRICT`: a customer can be
    deleted with everything they own, but a basket, item or address with deliveries can't be deleted alone.
- **Cut-offs** (`SLOT_CUTOFFS`): morning closes 21:00 the evening before; evening closes 13:00
  the same day. After that the round is *packed*:
  - `set-day` and `skip-day` refuse it;
  - `build_roster` leaves its rows untouched, so pause, cancel and edits apply from the next open round;
  - the calendar reports `locked` slots, and the UI greys them out.
  - Use `subscriptions.cutoffs.is_locked()`.
- **The roster** (`build_roster`) turns baskets into `Delivery` rows for 14 days.
  - It's idempotent and bulk-creates new rows.
  - It locks each basket (`select_for_update`) while it works, and extends to the furthest scheduled row for scoped runs.
  - It un-pauses baskets whose `resume_on` has arrived.
  - `ensure_roster()` runs it once a day from busy endpoints as a safety net; production should also run
    `manage.py build_roster` from cron.
- **`SubscriptionLine.quantity_on(day)`** is the single source of truth for what goes out.
  Use `line_total()` for money, so the calendar and the actual charges always round the same way.
- **Money:**
  - `Delivery.mark_delivered()` is a conditional UPDATE, so a double tap charges once. `set_status()` refunds
    when a delivered row is taken back. Never change a delivery's status any other way.
  - Changing a line's variant must re-price it (`unit_price = variant.price`). Existing lines keep
    their price when staff change a price.
  - Validate client amounts with `orders.money.parse_amount`.
  - Deliveries and orders are read-only in the Wagtail admin on purpose, because editing there skips the wallet.
- **Demo switches** (`settings.py`): both default to `DEBUG` and must be **off** for real money.
  - `OTP_SHOW_CODE` — no SMS gateway yet; shows the sign-in code on screen.
  - `WALLET_SELF_TOPUP` — lets customers credit their own wallet; there's no payment gateway.
- **Sign-in:**
  - `normalise_phone()` only accepts a real Indian mobile, and returns `""` for anything else.
  - OTP is throttled per IP (DRF scopes) and per phone. Attempts are counted atomically (`OneTimeCode.verify`).
  - Refresh tokens rotate and are blacklisted; `POST /api/auth/logout/` retires one.
- **One-off orders** can't be placed (the API is read-only), because nothing puts them on the round or charges them.
- **Offer codes** (`offers` app) only ever credit the wallet, never change a price.
  - `offers.services.redeem()` locks the wallet, so a code works once per household. Farm-made codes
    (`Coupon`, edited in the admin under Offers) credit a per cent of the basket's month, a fixed amount or a pack's price.
  - Each customer's `referral_code` is also a code. The new household is credited at once, and the referrer when that
    household's first delivery is charged (`pay_referrer()`, called from `mark_delivered()`).
  - The app applies a code right after a basket starts, or from the wallet page.

## Frontend conventions

- **Styling:**
  - Plain CSS in `styles/app.css`, using tokens from `tokens.css` (`--ink`, `--accent` lime `#C6F24B`,
    `--panel` green `#0f5a47`, `--sp-*`, `--r-*`, `--t-*`).
  - Reuse existing classes (`.btn`, `.card`, `.row`, `.chip`, `.tag`, `.split`, `.stack`, `.shell`) before inventing new ones.
  - Dark mode flips tokens only.
- **Breakpoints:**
  - Phone-first. 900px switches to desktop: `SiteHeader`, breadcrumbs and footer appear, and the bottom tabs hide.
  - `btn--block` is full width; add `btn--desk-auto` to size it to its label on desktop.
  - Long text is capped with `.lede` or `.measure`.
- **Header:** every page renders `<AppBar>` first. On phones it's the top bar; on desktop it becomes the
  breadcrumb row, and the persistent `SiteHeader` in the shell does the navigation. Pass `crumb` when the
  phone bar has no title.
- **Dialogs and messages:**
  - Pop-ups are `<Sheet>`: focus-trapped, dragged only by the grip, and bottom sheets on phones.
  - For confirmation use `await ask({...})`, never `window.confirm`.
  - For feedback use `toast()`.
- **API:**
  - All calls go through `api.get/post/patch/del` in `lib/api.ts`. It refreshes tokens, clears a dead login,
    retries as a guest, and turns every failure into `ApiError` with a readable `.message`.
  - Dates for skip and pause come from the server's calendar, never the device clock.
- **Images:** use `photo(key, w, h, sizes)` / `fullBleed(key)` from `lib/photos.ts` (width-based srcset).
- **Smooth scrolling on phones:**
  - A page must not change height while data loads. Loading placeholders reuse the real card's markup
    with blank text; copy that comes from the CMS falls back to the seeded text.
  - Choose signed-in layouts with `useSignedIn()`, not `user`, so a stored login never flashes the guest page.
  - Size screen-tall sections with `svh`, never `dvh`: `dvh` changes as the address bar slides.
  - No `backdrop-filter`, animated `filter: blur()` or endless image drift below 900px.

## Working rules

- **Git identity:** it's `shivduttkarwa <shivduttkarwa@gmail.com>`. **Never** run `git config user.*`, use
  `--author`, `-c user.*`, `GIT_AUTHOR_*` or `--no-verify`, and never use the Claude account email for git. Global
  pre-commit and pre-push hooks (`C:/Users/shivd/.githooks`) reject any other identity. Commit or push only
  when asked.
- **Comments:** default to none. Write one short plain line only for a real gotcha, not narration or
  "fixed X" notes; that belongs in the commit message.
- **Style:** match the surrounding code. Python is Django-idiomatic, and `DEBUG`-dependent behaviour goes through
  settings. TypeScript is strict with no `any`.
- **Model changes:** ship a migration and a test. Add tests next to the app (`<app>/tests.py`) using
  `firstlight.testing` (`customer()`, `variant()`, `staff()`, `api(user)`, and `at("YYYY-MM-DD HH:MM")` to freeze
  the farm clock for cut-off logic).
- **Verify in a browser:** for UI work, check both desktop (1280) and a phone (390). No Playwright project is set
  up; ad-hoc scripts using system Chrome have worked.
- **Seed:** `manage.py seed` is safe to re-run and never overwrites farm edits. Outside DEBUG it needs
  `--admin-password`.

## Status / open items

- **Deployment:** a single AWS Lightsail server (Ubuntu 24.04: nginx + gunicorn + PostgreSQL 18 + cron for
  `build_roster`), all in `deploy/`. `setup.sh` provisions it once; `.\deploy.ps1` ships committed `main`
  (push → server runs `deploy/deploy.sh <sha>`). README "Deploying" has the steps. For a client demo, set
  `OTP_SHOW_CODE=true` and `WALLET_SELF_TOPUP=true`, which setup does on first run.
- **Not built yet:** SMS gateway, payment gateway, one-off orders on the round, delivery-area check, a service
  worker for offline riders.
- **Hiding a product** only removes it from the shop. Existing baskets still receive it, and the farm desk says so.
