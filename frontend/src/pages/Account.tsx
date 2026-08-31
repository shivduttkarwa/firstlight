import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AddressForm } from "../components/AddressForm";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Empty, Icon, Sheet, Skeletons, Spinner } from "../components/ui";
import { ApiError, api, type Address, type Delivery, type Summary, type Wallet } from "../lib/api";
import { longDate, money, relativeDay, slotLabel } from "../lib/format";
import { toast, useAuth } from "../store/useStore";

function RequireUser({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const location = useLocation();
  if (!ready) {
    return (
      <div className="shell">
        <Skeletons count={3} height={80} />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

/* ── Overview ──────────────────────────────────────────────────────── */

export function Account() {
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const baskets = useAuth((s) => s.baskets);
  const [summary, setSummary] = useState<Summary | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) void api.get<Summary>("/deliveries/summary/").then(setSummary).catch(() => undefined);
  }, [user]);

  return (
    <RequireUser>
      <AppBar title="You" />
      <div className="shell">
        <div className="inline" style={{ gap: "var(--sp-4)", flexWrap: "nowrap" }}>
          <div
            style={{
              width: 56,
              height: 56,
              flex: "none",
              borderRadius: "var(--r-md)",
              background: "var(--panel)",
              color: "var(--accent)",
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-display)",
              fontSize: "1.4rem",
            }}
          >
            {(user?.full_name || user?.phone || "?").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="h2">{user?.full_name || "Your account"}</h1>
            <p className="sm muted">{user?.phone}</p>
          </div>
        </div>

        <div className="tiles mt-3">
          <Link to="/account/wallet" className="tile">
            <div className="tile__k">Wallet</div>
            <div className="tile__v num">{money(summary?.wallet_balance ?? user?.wallet_balance ?? 0)}</div>
          </Link>
          <div className="tile">
            <div className="tile__k">This month</div>
            <div className="tile__v num">{money(summary?.spend_this_month ?? 0)}</div>
          </div>
        </div>

        <div className="stack flow-sm mt-3">
          <Link to="/basket" className="row">
            <span className="row__art" style={{ background: "var(--brand-soft)" }}>
              <Icon.basket />
            </span>
            <span className="row__main">
              <span className="row__t">My basket</span>
              <span className="row__s">
                {baskets[0] ? `${baskets[0].item_count} items · ${money(baskets[0].monthly_estimate)}/month` : "Nothing yet"}
              </span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>

          <Link to="/account/deliveries" className="row">
            <span className="row__art" style={{ background: "var(--accent-soft)" }}>
              <Icon.calendar />
            </span>
            <span className="row__main">
              <span className="row__t">Deliveries</span>
              <span className="row__s">{summary?.delivered_this_month ?? 0} delivered this month</span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>

          <Link to="/account/wallet" className="row">
            <span className="row__art" style={{ background: "var(--ok-soft)" }}>
              <Icon.wallet />
            </span>
            <span className="row__main">
              <span className="row__t">Wallet &amp; payments</span>
              <span className="row__s">Top up, see every charge</span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>

          <Link to="/account/addresses" className="row">
            <span className="row__art">
              <Icon.pin />
            </span>
            <span className="row__main">
              <span className="row__t">Addresses</span>
              <span className="row__s">Where the milk is left</span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>
        </div>

        <div className="stack flow-sm mt-3">
          <Link to="/the-farm" className="row">
            <span className="row__main">
              <span className="row__t">The farm</span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>
          <Link to="/how-it-works" className="row">
            <span className="row__main">
              <span className="row__t">How it works</span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>
        </div>

        <button
          className="btn btn--ghost btn--block mt-3"
          style={{ marginBottom: "var(--sp-8)" }}
          onClick={() => {
            signOut();
            navigate("/");
          }}
        >
          Sign out
        </button>
      </div>
    </RequireUser>
  );
}

/* ── Wallet ────────────────────────────────────────────────────────── */

const PRESETS = [500, 1000, 2000, 5000];

export function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const refreshUser = useAuth((s) => s.refreshUser);

  useEffect(() => {
    void api.get<Wallet>("/wallet/").then(setWallet).catch(() => undefined);
  }, []);

  async function topUp() {
    setBusy(true);
    try {
      setWallet(await api.post<Wallet>("/wallet/", { amount }));
      await refreshUser();
      toast(`${money(amount)} added.`);
      setOpen(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Top-up failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequireUser>
      <AppBar back="/account" title="Wallet" />
      <div className="shell">
        <div className="card card--pad" style={{ background: "var(--panel)", color: "var(--on-panel)" }}>
          <span className="eyebrow eyebrow--bare" style={{ color: "var(--on-panel-dim)" }}>
            Balance
          </span>
          <div className="num" style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", marginTop: 6 }}>
            {money(wallet?.balance ?? 0, true)}
          </div>
          <p className="sm" style={{ color: "var(--on-panel-dim)", marginTop: 6 }}>
            Every delivery is drawn from here on the day it goes out.
          </p>
          <button className="btn btn--primary btn--block mt-3" onClick={() => setOpen(true)}>
            Add money
          </button>
        </div>

        <h2 className="h3 mt-3 mb-2">Recent activity</h2>
        {wallet === null ? (
          <Skeletons count={4} height={62} />
        ) : wallet.transactions.length === 0 ? (
          <Empty title="Nothing yet" body="Top-ups and delivery charges will show up here." />
        ) : (
          <div className="stack flow-sm" style={{ paddingBottom: "var(--sp-8)" }}>
            {wallet.transactions.map((t) => (
              <div key={t.id} className="row">
                <span
                  className="row__art"
                  style={{ background: t.kind === "credit" ? "var(--ok-soft)" : "var(--line-2)" }}
                >
                  {t.kind === "credit" ? <Icon.plus /> : <Icon.basket />}
                </span>
                <span className="row__main">
                  <span className="row__t" style={{ whiteSpace: "normal" }}>
                    {t.note}
                  </span>
                  <span className="row__s">
                    {new Date(t.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="row__end">
                  <span
                    className="num"
                    style={{ fontWeight: 700, color: t.kind === "credit" ? "var(--ok)" : "var(--ink)" }}
                  >
                    {t.kind === "credit" ? "+" : "−"}
                    {money(t.amount, true)}
                  </span>
                  <span className="row__s num">{money(t.balance_after, true)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add money"
        footer={
          <button className="btn btn--primary btn--lg btn--block" onClick={topUp} disabled={busy || !Number(amount)}>
            {busy ? <Spinner /> : null} Add {money(amount || 0)}
          </button>
        }
      >
        <div className="tiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              className={`opt${Number(amount) === p ? " opt--on" : ""}`}
              onClick={() => setAmount(String(p))}
            >
              <span className="opt__t num" style={{ paddingRight: 0 }}>
                {money(p)}
              </span>
            </button>
          ))}
        </div>
        <div className="field mt-2">
          <span className="label">Or another amount</span>
          <input
            className="input num"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
          />
        </div>
        <p className="hint">No payment gateway is connected yet, so this credits the wallet straight away.</p>
      </Sheet>
    </RequireUser>
  );
}

/* ── Deliveries ────────────────────────────────────────────────────── */

export function Deliveries() {
  const [rows, setRows] = useState<Delivery[] | null>(null);

  useEffect(() => {
    void api.get<Delivery[]>("/deliveries/").then(setRows).catch(() => setRows([]));
  }, []);

  const grouped = (() => {
    if (!rows) return [];
    const map = new Map<string, Delivery[]>();
    for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      map.set(row.date, [...(map.get(row.date) ?? []), row]);
    }
    return [...map.entries()];
  })();

  return (
    <RequireUser>
      <AppBar back="/account" title="Deliveries" />
      <div className="shell">
        {rows === null ? (
          <Skeletons count={5} height={70} />
        ) : rows.length === 0 ? (
          <Empty
            title="No deliveries yet"
            body="Once your basket is running, the next fortnight shows up here."
            action={
              <Link to="/packages" className="btn btn--primary">
                See packages
              </Link>
            }
          />
        ) : (
          <div className="stack" style={{ paddingBottom: "var(--sp-8)" }}>
            {grouped.map(([date, items]) => (
              <div key={date}>
                <div className="between mb-2">
                  <h3 className="h3">{relativeDay(date)}</h3>
                  <span className="tiny muted">{longDate(date)}</span>
                </div>
                <div className="stack flow-sm">
                  {items.map((row) => (
                    <div key={row.id} className="row" style={{ ["--accent" as string]: row.product.accent }}>
                      <span className="row__art">
                        <ProductArt kind={row.product.kind} accent={row.product.accent} size="70%" />
                      </span>
                      <span className="row__main">
                        <span className="row__t">
                          {row.product.name} · {row.quantity} × {row.product.variant_label}
                        </span>
                        <span className="row__s">{slotLabel(row.slot)} round</span>
                      </span>
                      <span className="row__end">
                        <span className={`tag tag--${row.status}`}>{row.status_display}</span>
                        <span className="row__s num" style={{ marginTop: 3 }}>
                          {money(row.total, true)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </RequireUser>
  );
}

/* ── Addresses ─────────────────────────────────────────────────────── */

export function Addresses() {
  const addresses = useAuth((s) => s.addresses);
  const loadAddresses = useAuth((s) => s.loadAddresses);
  const [editing, setEditing] = useState<Address | null>(null);
  const [adding, setAdding] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get("next");

  async function makeDefault(a: Address) {
    try {
      await api.post(`/addresses/${a.id}/make_default/`);
      await loadAddresses();
      toast("Default address updated.");
    } catch {
      toast("Could not update.", "error");
    }
  }

  async function remove(a: Address) {
    if (!confirm(`Remove ${a.line1}?`)) return;
    try {
      await api.del(`/addresses/${a.id}/`);
      await loadAddresses();
      toast("Address removed.");
    } catch (e) {
      toast(
        e instanceof ApiError && e.status === 400
          ? "A subscription uses this address, so it cannot be removed."
          : "Could not remove that address.",
        "error",
      );
    }
  }

  return (
    <RequireUser>
      <AppBar back="/account" title="Addresses" />
      <div className="shell">
        {addresses.length === 0 && !adding ? (
          <Empty
            title="No address yet"
            body="Tell us where to leave the milk, and anything the rider should know."
            action={
              <button className="btn btn--primary" onClick={() => setAdding(true)}>
                Add an address
              </button>
            }
          />
        ) : (
          <div className="stack flow-sm">
            {addresses.map((a) => (
              <div key={a.id} className="card card--pad">
                <div className="between">
                  <span className="inline" style={{ gap: 8 }}>
                    <b style={{ textTransform: "capitalize" }}>{a.label}</b>
                    {a.is_default && <span className="tag tag--active">Default</span>}
                  </span>
                  <button className="iconbtn" onClick={() => setEditing(a)} aria-label="Edit">
                    <Icon.pencil />
                  </button>
                </div>
                <p className="sm muted mt-1">
                  {a.contact_name} · {a.contact_phone}
                  <br />
                  {a.line1}
                  {a.landmark && `, ${a.landmark}`}
                  <br />
                  {a.village}, {a.district} {a.pincode}
                </p>
                {a.delivery_note && (
                  <p className="tiny muted mt-1" style={{ fontStyle: "italic" }}>
                    “{a.delivery_note}”
                  </p>
                )}
                <div className="inline mt-2">
                  {!a.is_default && (
                    <button className="btn btn--ghost btn--sm" onClick={() => void makeDefault(a)}>
                      Make default
                    </button>
                  )}
                  <button className="btn btn--danger btn--sm" onClick={() => void remove(a)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button className="btn btn--soft btn--block" onClick={() => setAdding(true)}>
              <Icon.plus /> Add another address
            </button>
          </div>
        )}
      </div>

      <Sheet
        open={adding || !!editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        title={editing ? "Edit address" : "New address"}
      >
        <AddressForm
          initial={editing ?? undefined}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            if (next) navigate(next);
          }}
          onCancel={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      </Sheet>
    </RequireUser>
  );
}
