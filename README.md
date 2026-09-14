# Firstlight

A milk subscription app for a single farm at **Village 11 SHPD, Post 8 SHPD, Tehsil Suratgarh, District Sriganganagar, Rajasthan**.

Cow and buffalo milk drawn at first light, plus ghee, curd and chhach, on a morning
(5.30 – 8.00 am) and evening (5.00 – 7.30 pm) round.

There are two apps in here, sharing one codebase and one API:

- **The storefront** — what customers use. Mobile-first, installable, bottom tab bar.
- **The farm desk** — what the farm uses. Runs on a phone during the round and on a
  desktop in the office. No Wagtail vocabulary anywhere in it.

**Stack** — React 18 + TypeScript + Vite + Framer Motion on the front, Wagtail 8 on
Django 6.1 with DRF and PostgreSQL 18 behind. No UI kit; the design system is
hand-written CSS.

---

## Running it

Two terminals. The backend must be up first — Vite proxies `/api` to it.

```bash
# terminal 1 — API on :8000
cd backend
.venv/Scripts/python.exe manage.py runserver

# terminal 2 — apps on :5173
cd frontend
npm run dev
```

| | |
|---|---|
| Storefront | http://localhost:5173 |
| Farm desk | http://localhost:5173/farm — `admin` / `firstlight` |
| API root | http://localhost:8000/api/ |
| Wagtail admin (rarely needed) | http://localhost:8000/admin/ |

**On a phone.** The dev server listens on every interface, so open the `Network:` URL
Vite prints (e.g. `http://192.168.1.5:5173`) on any device on the same wifi. Nothing
else needs changing — `/api` is proxied by Vite server-side, so the phone never talks
to Django directly. Note it will not install to the home screen over plain http; only
`localhost` and https count as secure contexts.

## Two ways in

**Customers — phone number and a one-time code.** Nobody buying milk wants to invent
a password, and the farm needs the phone number anyway to deliver. No SMS gateway is
wired up yet, so while `OTP_SHOW_CODE` is on (it follows `DEBUG` unless set) the code
comes back in the response and the sign-in screen prints it on the card. Any Indian
mobile number works. Codes are capped per number and per IP, and a number with too
many wrong guesses is locked for a day.

**Staff — username and password**, at `/farm/login`. Staff accounts have no phone
number, so nobody can reach them through the customer code flow.

Both live in one `accounts.User` table; `username` is the Django login field and
customers get their phone number copied into it.

## First-time setup

```bash
cd backend
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
# create the postgres database, then:
.venv/Scripts/python.exe manage.py migrate
.venv/Scripts/python.exe manage.py seed     # catalogue, packages, staff login, storefront copy

cd ../frontend
npm install
```

`seed` is safe to re-run: anything that already exists — prices, hidden products,
website text the farm has edited — is left alone. Under `DEBUG` it creates the
`admin` / `firstlight` staff account; anywhere else pass `--admin-password` (or set
`SEED_ADMIN_PASSWORD`). Settings come from `backend/.env` (see `.env.example`). The
database is on **PostgreSQL 18, port 5432** — note this machine also runs PG 13 on 5433.

**Tests.** `.venv/Scripts/python.exe manage.py test` runs the backend suite; GitHub
Actions runs it on every push, with `DEBUG` off, alongside the frontend build.

**Settings that matter on a server** (all in `.env`):

| | |
|---|---|
| `DJANGO_DEBUG` | Off unless set. Must be off anywhere public. |
| `DJANGO_SECRET_KEY` | Required when `DEBUG` is off; it signs every login token. |
| `OTP_SHOW_CODE` | Show the sign-in code on screen. Needed until SMS exists — a demo only. |
| `WALLET_SELF_TOPUP` | Let customers add wallet money themselves. A demo only — it is free money. |

## Deploying

One Lightsail server (Ubuntu 24.04, Mumbai) runs everything. nginx serves the
storefront and hands `/api`, `/admin`, `/django-admin` and `/documents` to gunicorn;
PostgreSQL 18 sits on the same box; cron builds the roster at 00:15. The files are in
`deploy/`.

**Connect from PowerShell.** Add this to `~/.ssh/config` and `ssh firstlight` just works:

```
Host firstlight
    HostName <static-ip>
    User ubuntu
    IdentityFile ~/.ssh/firstlight-mumbai.pem
    IdentitiesOnly yes
    ServerAliveInterval 60
```

**The first time.** Attach the static IP (and point the domain's A record at it),
open ports 80 and 443 in the Lightsail firewall, and push `deploy/` to GitHub. Then:

```powershell
scp deploy/setup.sh firstlight:
ssh firstlight "sudo DOMAIN=milk.example.in EMAIL=you@example.com bash setup.sh"
```

It installs PostgreSQL 18, Node 22 and nginx, clones the repo into
`/srv/firstlight/app`, writes `backend/.env`, deploys, seeds, and gets an HTTPS
certificate. It prints the staff password, which it also keeps in
`/root/firstlight-admin-password`. Leave `DOMAIN` out to serve plain http on the IP:
the storefront and farm desk work, but Wagtail's `/admin` needs HTTPS to sign in.
Setup is safe to re-run — do that to add a domain later, or after changing the
service, cron or nginx files in `deploy/`.

**Every time after that:**

```powershell
.\deploy.ps1
```

It only deploys committed work on `main`: it pushes to GitHub, then the server fetches
that exact commit, installs requirements, runs `check` and the migrations, builds the
storefront, swaps it in, and reloads gunicorn without dropping requests.
`.\deploy.ps1 -Ref <commit>` puts an earlier commit back, but migrations don't run
backwards, so fix a bad migration forward instead.

**On the server:** `journalctl -u firstlight -f` is the API log, `journalctl -t
firstlight-roster` the nightly roster. Settings are in
`/srv/firstlight/app/backend/.env` — edit with `sudo -u firstlight nano …`, then
`sudo systemctl restart firstlight`. Setup writes that file once, turning on
`OTP_SHOW_CODE` and `WALLET_SELF_TOPUP` for the demo; after that it only keeps the
host and https settings in step.

---

## The subscription model

A customer has **one basket**, not a pile of separate subscriptions. The basket holds
**lines**, and each line has its own rhythm.

```
Subscription (the basket)  ── one per household, one bill, one place to pause
 ├─ SubscriptionLine  2 × Cow Milk 2L    every day        morning
 ├─ SubscriptionLine  1 × Fresh Curd 400g Mon & Thu       morning
 └─ SubscriptionLine  1 × Desi Ghee 500g  once a month     morning
      └─ DayOverride  "on the 14th, make it 3" / "on the 15th, none"
```

**Rhythms** are `daily`, `alternate` (counted from the line's start date),
`weekdays` (a list where 0 = Monday), or `monthly` (same date each month, pulled
back to the last day in shorter months).

**Per-day control.** A `DayOverride` beats the rhythm for one date. Quantity `0`
means skip; any other number changes the amount; deleting the override falls back to
the rhythm. Because an override can also *add* a delivery on a day the rhythm skips,
"two litres this Sunday because guests are coming" is one tap.

**Packages** are ready-made baskets the farm defines. Choosing one copies its items
into a normal basket the customer can then edit, and stamps the package's discount
onto it. Prices stay per-item so the wallet ledger stays honest — the monthly figure
shown is an estimate at today's prices, not a fixed fee.

`SubscriptionLine.quantity_on(day)` is the single source of truth for how much goes
out. The roster builder, the 30-day calendar in the app and every price estimate all
go through it.

## The delivery roster

Deliveries are not computed on the fly; they are **cut into a roster** the farm works
from. Editing a basket re-cuts its own rows immediately. Run this nightly (cron) to
extend the window — and as a safety net the API tops it up once a day by itself the
first time the farm desk or a customer's deliveries are opened:

```bash
.venv/Scripts/python.exe manage.py build_roster --days 14
```

Safe to run repeatedly. Days the customer skipped or paused are withdrawn while still
`scheduled`; rows already delivered are never touched. Staff can also trigger it from
**Farm desk → More → Rebuild the roster**. A basket paused until a date becomes active
again when that date arrives.

**Cut-offs.** A round is *packed* at `SLOT_CUTOFFS`: 9 pm the night before for the
morning round, 1 pm the same day for the evening. After that its rows are frozen —
day changes are refused, and a pause, cancel or basket edit only takes effect from the
next open round. The app greys packed days out.

**Money never moves at the gate.** Customers top up a wallet; marking a delivery done
debits it. That is one conditional update, so a double tap charges once; taking a
delivered item back to missed refunds it. Deliveries are read-only in the Wagtail
admin, because a status edited there would skip the wallet. Removing a basket item
retires it rather than deleting it, so its history and charges stay.

---

## The farm desk

`/farm`, staff only. Four screens:

- **Round** — the default. One slot's deliveries grouped into stops, in walking
  order, with a progress bar. Tap a stop to see what to hand over, the customer's
  wallet balance, and their note. One button marks the stop delivered and debits the
  wallet. Low balances are flagged before you knock.
- **Customers** — search by name or phone; see baskets, upcoming deliveries and the
  full money trail. Record a cash or UPI top-up straight onto the balance.
- **Products** — change a price in two taps. Existing subscribers keep the price they
  signed up at, and the screen says so.
- **More** — today's numbers, what to fill tomorrow broken down by product and slot,
  wallets running low, the website text editor, and the roster rebuild.

**Website text** lets the farm rewrite the storefront headline, subheading and story
without touching the CMS. It writes to the Wagtail page and publishes a revision, so
the change is live immediately and still versioned.

The Wagtail admin still exists at `/admin/` for deeper work (images, page structure,
package contents), but staff never need to see it.

---

## API

```
POST /api/auth/otp/request/       {phone}
POST /api/auth/otp/verify/        {phone, code, full_name?}  -> {user, tokens}
POST /api/auth/staff/login/       {username, password}       -> {user, tokens}
POST /api/auth/refresh/           {refresh}
GET  /api/auth/me/

GET  /api/products/               public
GET  /api/packages/               public — ready-made baskets
GET  /api/farm-info/              public — address, slots, cut-offs

     /api/addresses/              CRUD + POST {id}/make_default/
     /api/subscriptions/          CRUD, one basket per household
       POST {id}/from-package/    two-tap signup
       GET  {id}/calendar/        30 days of what goes out
       POST {id}/set-day/         {line, date, quantity|null}  per-day control
       POST {id}/skip-day/        {date}   skip every line that day
       POST {id}/pause|resume|cancel/
     /api/basket-lines/           CRUD, the items inside a basket
GET  /api/deliveries/             ?upcoming=true&from=&to=
GET  /api/deliveries/summary/
     /api/orders/                 one-off purchases
GET  /api/wallet/  POST /api/wallet/  {amount}

--- staff only (is_staff) ---
GET  /api/farm/overview/
GET  /api/farm/round/             ?date=&slot=
POST /api/farm/round/mark/        {delivery_ids | address+date+slot, status}
     /api/farm/customers/         list, detail, POST {id}/topup/
     /api/farm/products/          list, POST set-price/, POST {slug}/toggle/
GET/PATCH /api/farm/content/      the storefront words
POST /api/farm/roster/rebuild/
```

Everything except the public routes is scoped to the signed-in user; the farm routes
additionally require `is_staff`.

## Design

**Cold store.** Pine ink and cold white, with a single lime signal on top: lime is the
only bright colour in the system, so it always means *this is the thing to press*.
Pine green carries the brand, and a sky blue, emerald and red handle information,
success and failure. Product tints are deliberately non-literal — a cool spread across
the same family — so six vessels read as one set.

Bricolage Grotesque for display, Inter for UI, JetBrains Mono for anything that is a
number. Every price, quantity, date, code and micro-label is set in the monospace,
which is what makes a wallet ledger and a delivery roster read as data rather than prose.

Structure comes from hairlines and square corners (4–24px, buttons at 7px), not from
soft shadows and lozenges; shadow is reserved for things that genuinely float — sheets,
toasts, the hero. The page carries a faint surveyor's grid instead of a paper grain.

Colour lives entirely in `tokens.css`: a raw ramp assigned to a semantic layer
(`--bg`, `--surface`, `--ink`, `--brand`, `--accent`, `--panel`, `--ok`, `--bad`…).
Components only ever name the semantic token, so **dark mode is the same file** — one
`prefers-color-scheme` block re-points about twenty names and the whole app follows.

Editorial photography comes from Unsplash via `src/lib/photos.ts`; products keep the
drawn vessels in `ProductArt` so the catalogue works offline and stays on-palette.
Product and package accents are stored on the model — `seed` sets them, and existing
rows need updating if you change the palette.

Built phone-first at 390px — bottom tab bar, sheets that drag to dismiss, 48px
minimum tap targets, 16px inputs so iOS does not zoom, `safe-area-inset` padding, and
a web manifest so it installs to the home screen. Desktop is the enhancement: the
tabs become a top nav and the shell caps at 1180px.

## Things left deliberately open

- **No payment gateway.** `POST /api/wallet/` credits directly, and only while
  `WALLET_SELF_TOPUP` is on; the staff top-up records cash. Replace the body of
  `WalletView.post` with a gateway callback.
- **No SMS.** `OneTimeCode` is issued and returned in the response while `OTP_SHOW_CODE` is on.
- **One-off orders are read-only.** Nothing puts them on the round or charges for them
  yet, so placing one is switched off until that exists.
- **Offer codes are display only.** Nothing redeems `FIRSTLIGHT20` and friends yet.
- **No delivery-area check.** Any PIN code is accepted.
- **No service worker.** The manifest makes it installable, but it does not work
  offline yet — worth adding for riders in patchy signal.
- Packages can be edited in the Wagtail admin but not yet from the farm desk.
