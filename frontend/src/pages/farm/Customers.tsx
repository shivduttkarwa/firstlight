import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppBar } from "../../components/Shell";
import { Empty, Icon, Sheet, Skeletons, Spinner } from "../../components/ui";
import { ApiError, api, type CustomerDetail, type CustomerRow } from "../../lib/api";
import { frequencyLabel, money, relativeDay, slotLabel } from "../../lib/format";
import { toast } from "../../store/useStore";

export function FarmCustomers() {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      void api
        .get<CustomerRow[]>(`/farm/customers/?q=${encodeURIComponent(q)}`)
        .then(setRows)
        .catch(() => setRows([]));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <AppBar title="Customers" />
      <div className="shell">
        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              translate: "0 -50%",
              width: 18,
              height: 18,
              color: "var(--ink-3)",
            }}
          >
            <Icon.search />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 42 }}
            placeholder="Search by name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
          {rows === null ? (
            <Skeletons count={6} height={68} />
          ) : rows.length === 0 ? (
            <Empty title="Nobody found" body={q ? "No customer matches that search." : "No customers yet."} />
          ) : (
            <div className="stack flow-sm">
              {rows.map((row) => (
                <button key={row.id} className="row" onClick={() => navigate(`/farm/customers/${row.id}`)}>
                  <span
                    className="row__art"
                    style={{ background: "var(--panel)", color: "var(--accent)", fontWeight: 700 }}
                  >
                    {row.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="row__main">
                    <span className="row__t">{row.name}</span>
                    <span className="row__s num">
                      {row.phone} · {row.active_subscriptions} active
                    </span>
                  </span>
                  <span className="row__end">
                    <span
                      className="num sm"
                      style={{ fontWeight: 700, color: Number(row.wallet_balance) < 200 ? "var(--bad)" : undefined }}
                    >
                      {money(row.wallet_balance)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function FarmCustomerDetail() {
  const { id } = useParams();
  const [c, setC] = useState<CustomerDetail | null>(null);
  const [topup, setTopup] = useState(false);
  const [amount, setAmount] = useState("500");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setC(await api.get<CustomerDetail>(`/farm/customers/${id}/`));
    } catch {
      toast("Could not load that customer.", "error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addMoney() {
    setBusy(true);
    try {
      await api.post(`/farm/customers/${id}/topup/`, { amount });
      toast(`${money(amount)} added to ${c?.name}.`);
      setTopup(false);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not add money.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!c) {
    return (
      <>
        <AppBar back="/farm/customers" title="Customer" />
        <div className="shell">
          <Skeletons count={4} height={80} />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar back="/farm/customers" title={c.name} />
      <div className="shell">
        <div className="card card--pad" style={{ background: "var(--panel)", color: "var(--on-panel)" }}>
          <div className="between">
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-lg)" }}>{c.name}</div>
              <div className="sm num" style={{ color: "var(--on-panel-dim)" }}>
                {c.phone}
              </div>
            </div>
            <a href={`tel:${c.phone}`} className="iconbtn" style={{ color: "var(--accent)" }} aria-label="Call">
              <Icon.phone />
            </a>
          </div>
          <div className="rule" style={{ background: "rgba(242,235,223,0.14)" }} />
          <div className="between">
            <div>
              <div className="tiny" style={{ color: "var(--on-panel-dim)" }}>
                WALLET
              </div>
              <div
                className="num"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--t-xl)",
                  color: Number(c.wallet_balance) < 200 ? "var(--on-panel-bad)" : "var(--on-panel)",
                }}
              >
                {money(c.wallet_balance, true)}
              </div>
            </div>
            <button className="btn btn--primary btn--sm" onClick={() => setTopup(true)}>
              <Icon.plus /> Add money
            </button>
          </div>
        </div>

        <h2 className="h3 mt-3 mb-2">Baskets</h2>
        {c.subscriptions.length === 0 ? (
          <Empty title="No basket" body="This customer has not started a subscription." />
        ) : (
          c.subscriptions.map((b) => (
            <div key={b.id} className="card card--pad" style={{ marginBottom: "var(--sp-2)" }}>
              <div className="between">
                <span className="sm" style={{ fontWeight: 700 }}>
                  {b.package_name ?? "Custom basket"}
                </span>
                <span className={`tag tag--${b.status}`}>{b.status}</span>
              </div>
              <div className="sm muted mt-1">
                {b.address_summary} · about {money(b.monthly_estimate)}/month
              </div>
              <div className="stack flow-sm mt-2">
                {b.lines.map((line) => (
                  <div key={line.id} className="between sm">
                    <span>
                      {line.quantity} × {line.product.name} {line.product.variant_label}
                    </span>
                    <span className="muted tiny">
                      {frequencyLabel(line.frequency, line.weekdays)} · {slotLabel(line.slot)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        <h2 className="h3 mt-3 mb-2">Coming up</h2>
        {c.upcoming.length === 0 ? (
          <p className="muted sm">Nothing scheduled.</p>
        ) : (
          <div className="stack flow-sm">
            {c.upcoming.map((d) => (
              <div key={d.id} className="row">
                <span className="row__main">
                  <span className="row__t">
                    {d.quantity} × {d.product} {d.variant_label}
                  </span>
                  <span className="row__s">
                    {relativeDay(d.date)} · {slotLabel(d.slot)}
                  </span>
                </span>
                <span className="row__end num sm">{money(d.total)}</span>
              </div>
            ))}
          </div>
        )}

        <h2 className="h3 mt-3 mb-2">Money</h2>
        <div className="stack flow-sm" style={{ paddingBottom: "var(--sp-8)" }}>
          {c.recent_transactions.map((t) => (
            <div key={t.id} className="row">
              <span className="row__main">
                <span className="row__t" style={{ whiteSpace: "normal" }}>
                  {t.note}
                </span>
                <span className="row__s">
                  {new Date(t.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
              <span className="row__end num sm" style={{ color: t.kind === "credit" ? "var(--ok)" : undefined, fontWeight: 700 }}>
                {t.kind === "credit" ? "+" : "−"}
                {money(t.amount, true)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Sheet
        open={topup}
        onClose={() => setTopup(false)}
        title={`Add money for ${c.name}`}
        footer={
          <button className="btn btn--primary btn--lg btn--block" onClick={addMoney} disabled={busy || !Number(amount)}>
            {busy ? <Spinner /> : null} Add {money(amount || 0)}
          </button>
        }
      >
        <div className="tiles" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {[200, 500, 1000, 2000].map((p) => (
            <button key={p} className={`opt${Number(amount) === p ? " opt--on" : ""}`} onClick={() => setAmount(String(p))}>
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
        <p className="hint">Record cash or UPI the customer handed over. It goes straight onto their balance.</p>
      </Sheet>
    </>
  );
}
