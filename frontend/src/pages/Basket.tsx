import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Empty, Icon, Sheet, Skeletons, Spinner } from "../components/ui";
import { ApiError, api, type Basket as TBasket, type BasketLine, type CalendarDay } from "../lib/api";
import { WEEKDAYS, addDays, frequencyLabel, money, relativeDay, shortDate, slotLabel, toISO } from "../lib/format";
import { toast, useAuth } from "../store/useStore";

export function Basket() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const baskets = useAuth((s) => s.baskets);
  const loadBaskets = useAuth((s) => s.loadBaskets);

  const [calendar, setCalendar] = useState<CalendarDay[] | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [lineOpen, setLineOpen] = useState<BasketLine | null>(null);
  const [busy, setBusy] = useState(false);

  const basket = baskets[0] ?? null;

  const loadCalendar = useCallback(
    async (id: number) => {
      const res = await api.get<{ days: CalendarDay[] }>(`/subscriptions/${id}/calendar/`);
      setCalendar(res.days);
    },
    [],
  );

  useEffect(() => {
    if (basket) void loadCalendar(basket.id).catch(() => setCalendar([]));
  }, [basket?.id, loadCalendar]);

  if (!ready) {
    return (
      <>
        <AppBar title="My basket" />
        <div className="shell">
          <Skeletons count={3} height={90} />
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <AppBar title="My basket" />
        <div className="shell sect">
          <Empty
            title="Sign in to see your basket"
            body="Your standing order lives here — what comes, on which days, and how much."
            action={
              <Link to="/login?next=/basket" className="btn btn--primary">
                Sign in
              </Link>
            }
          />
        </div>
      </>
    );
  }

  if (!basket) {
    return (
      <>
        <AppBar title="My basket" />
        <div className="shell sect">
          <Empty
            title="Nothing on the round yet"
            body="Pick a ready-made package, or build your own basket from the shop."
            action={
              <div className="inline" style={{ justifyContent: "center" }}>
                <Link to="/packages" className="btn btn--primary">
                  See packages
                </Link>
                <Link to="/shop" className="btn btn--ghost">
                  Browse
                </Link>
              </div>
            }
          />
        </div>
      </>
    );
  }

  async function act(path: string, payload?: unknown, message?: string) {
    setBusy(true);
    try {
      await api.post(`/subscriptions/${basket!.id}/${path}/`, payload);
      if (message) toast(message);
      await loadBaskets();
      await loadCalendar(basket!.id);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "That did not work.", "error");
    } finally {
      setBusy(false);
    }
  }

  const paused = basket.status === "paused";
  const today = calendar?.[0];

  return (
    <>
      <AppBar
        title="My basket"
        right={
          <button className="iconbtn iconbtn--filled" onClick={() => navigate("/shop")} aria-label="Add an item">
            <Icon.plus />
          </button>
        }
      />

      <div className="shell stack">
        {/* Summary */}
        <div className="card card--pad" style={{ background: "var(--panel)", color: "var(--on-panel)" }}>
          <div className="between">
            <span className="eyebrow eyebrow--bare" style={{ color: "var(--on-panel-dim)" }}>
              {basket.package_name ?? "Your basket"}
            </span>
            <span className={`tag tag--${basket.status}`}>{basket.status}</span>
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-2xl)", lineHeight: 1, marginTop: 10 }}>
            {money(basket.monthly_estimate)}
            <span style={{ fontSize: "var(--t-sm)", color: "var(--on-panel-dim)", fontFamily: "var(--font-body)" }}>
              {" "}
              /month
            </span>
          </div>
          <div className="sm" style={{ color: "var(--on-panel-dim)", marginTop: 6 }}>
            {basket.item_count} item{basket.item_count === 1 ? "" : "s"} · to {basket.address_summary}
          </div>
          {Number(basket.discount_percent) > 0 && (
            <div className="chip chip--ok" style={{ marginTop: 10 }}>
              {Number(basket.discount_percent)}% package discount applied
            </div>
          )}
          {paused && basket.resume_on && (
            <div className="chip chip--accent" style={{ marginTop: 10 }}>
              Resumes {shortDate(basket.resume_on)}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="inline">
          {paused ? (
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void act("resume", undefined, "Back on the round.")}>
              Resume now
            </button>
          ) : (
            <>
              <button
                className="btn btn--soft btn--sm"
                disabled={busy}
                onClick={() => void act("skip-day", { date: toISO(addDays(new Date(), 1)) }, "Tomorrow is off.")}
              >
                Skip tomorrow
              </button>
              <button
                className="btn btn--soft btn--sm"
                disabled={busy}
                onClick={() => void act("pause", { resume_on: toISO(addDays(new Date(), 8)) }, "Paused for a week.")}
              >
                Pause a week
              </button>
            </>
          )}
          {busy && <Spinner />}
        </div>

        {/* Today */}
        {today && today.lines.length > 0 && (
          <div>
            <h2 className="h3 mb-2">Today</h2>
            {today.lines.map((entry) => (
              <div key={entry.line} className="row" style={{ ["--accent" as string]: entry.accent }}>
                <span className="row__art">
                  <span style={{ fontWeight: 700 }}>{entry.quantity}×</span>
                </span>
                <span className="row__main">
                  <span className="row__t">{entry.name}</span>
                  <span className="row__s">
                    {entry.variant_label} · {slotLabel(entry.slot)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Items */}
        <div>
          <div className="sectionhead">
            <h2 className="h3">What you get</h2>
            <Link to="/shop" className="linkish">
              Add item
            </Link>
          </div>
          <div className="stack flow-sm">
            {basket.lines.map((line) => (
              <button
                key={line.id}
                className="row"
                onClick={() => setLineOpen(line)}
                style={{ ["--accent" as string]: line.product.accent }}
              >
                <span className="row__art">
                  <ProductArt kind={line.product.kind} accent={line.product.accent} size="70%" />
                </span>
                <span className="row__main">
                  <span className="row__t">
                    {line.product.name} · {line.product.variant_label}
                  </span>
                  <span className="row__s">
                    {line.quantity} × {frequencyLabel(line.frequency, line.weekdays)} · {slotLabel(line.slot)}
                  </span>
                </span>
                <span className="row__end muted">
                  <Icon.chev />
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div>
          <div className="sectionhead">
            <h2 className="h3">Next 30 days</h2>
            <span className="tiny muted">Tap a day to change it</span>
          </div>
          {calendar === null ? (
            <Skeletons count={1} height={230} />
          ) : (
            <CalendarGrid days={calendar} onPick={setDayOpen} />
          )}
        </div>

        <button
          className="btn btn--danger btn--block"
          disabled={busy}
          onClick={() => {
            if (confirm("Cancel this basket? Your deliveries will stop.")) {
              void act("cancel", undefined, "Basket cancelled.").then(() => navigate("/"));
            }
          }}
        >
          Cancel subscription
        </button>
      </div>

      <DaySheet
        basket={basket}
        day={calendar?.find((d) => d.date === dayOpen) ?? null}
        onClose={() => setDayOpen(null)}
        onSaved={(days) => setCalendar(days)}
      />

      <LineSheet
        line={lineOpen}
        onClose={() => setLineOpen(null)}
        onChanged={async () => {
          await loadBaskets();
          await loadCalendar(basket.id);
        }}
      />
    </>
  );
}

/* ── Calendar ──────────────────────────────────────────────────────── */

function CalendarGrid({ days, onPick }: { days: CalendarDay[]; onPick: (date: string) => void }) {
  // Pad the first week so columns line up with Mon–Sun.
  const lead = useMemo(() => {
    if (!days.length) return 0;
    const [y, m, d] = days[0].date.split("-").map(Number);
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  }, [days]);

  return (
    <div className="card card--pad">
      <div className="calhead">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w[0]}</span>
        ))}
      </div>
      <div className="calgrid">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const count = day.lines.reduce((n, l) => n + l.quantity, 0);
          const edited = day.lines.some((l) => l.overridden);
          return (
            <button
              key={day.date}
              className={`calday${count ? " calday--on" : ""}${edited ? " calday--edit" : ""}`}
              onClick={() => onPick(day.date)}
              title={`${relativeDay(day.date)} — ${count ? `${count} item(s), ${money(day.total)}` : "nothing"}`}
            >
              <span className="calday__n">{Number(day.date.slice(-2))}</span>
              {count > 0 && (
                <span className="calday__dots">
                  {day.lines.slice(0, 3).map((l, i) => (
                    <i key={i} style={{ background: l.accent }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="callegend">
        <span>
          <i className="callegend__on" /> delivering
        </span>
        <span>
          <i className="callegend__edit" /> you changed it
        </span>
      </div>
    </div>
  );
}

/* ── Sheet: edit one day ───────────────────────────────────────────── */

function DaySheet({
  basket,
  day,
  onClose,
  onSaved,
}: {
  basket: TBasket;
  day: CalendarDay | null;
  onClose: () => void;
  onSaved: (days: CalendarDay[]) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);

  async function setQuantity(lineId: number, quantity: number | null) {
    setBusy(lineId);
    try {
      const res = await api.post<{ days: CalendarDay[] }>(`/subscriptions/${basket.id}/set-day/`, {
        line: lineId,
        date: day!.date,
        quantity,
      });
      onSaved(res.days);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not change that day.", "error");
    } finally {
      setBusy(null);
    }
  }

  const entries = day
    ? basket.lines
        .filter((l) => l.is_active)
        .map((line) => ({
          line,
          entry: day.lines.find((e) => e.line === line.id) ?? null,
        }))
    : [];

  return (
    <Sheet open={!!day} onClose={onClose} title={day ? relativeDay(day.date) : ""}>
      {day && (
        <>
          <p className="sm muted" style={{ marginBottom: "var(--sp-4)" }}>
            {shortDate(day.date)} · {Number(day.total) > 0 ? money(day.total) : "nothing scheduled"}
          </p>

          <div className="stack flow-sm">
            {entries.map(({ line, entry }) => (
              <div key={line.id} className="card card--pad" style={{ padding: "var(--sp-4)" }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div className="row__t">{line.product.name}</div>
                    <div className="row__s">
                      {line.product.variant_label} · {slotLabel(line.slot)}
                    </div>
                  </div>
                  {busy === line.id ? (
                    <Spinner />
                  ) : (
                    <div className="stepper">
                      <button
                        onClick={() => setQuantity(line.id, Math.max(0, (entry?.quantity ?? 0) - 1))}
                        disabled={(entry?.quantity ?? 0) === 0}
                        aria-label="Less"
                      >
                        −
                      </button>
                      <span className="num">{entry?.quantity ?? 0}</span>
                      <button
                        onClick={() => setQuantity(line.id, (entry?.quantity ?? 0) + 1)}
                        disabled={(entry?.quantity ?? 0) >= 20}
                        aria-label="More"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
                {entry?.overridden && (
                  <button className="linkish" style={{ marginTop: 10 }} onClick={() => setQuantity(line.id, null)}>
                    Reset to usual ({line.quantity} × {frequencyLabel(line.frequency, line.weekdays).toLowerCase()})
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="hint mt-2">
            Changing a day only affects that date. Your usual rhythm carries on either side of it.
          </p>
        </>
      )}
    </Sheet>
  );
}

/* ── Sheet: edit one item ──────────────────────────────────────────── */

function LineSheet({
  line,
  onClose,
  onChanged,
}: {
  line: BasketLine | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<BasketLine | null>(line);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(line), [line]);

  if (!draft) return <Sheet open={false} onClose={onClose} children={null} />;

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/basket-lines/${draft!.id}/`, {
        quantity: draft!.quantity,
        slot: draft!.slot,
        frequency: draft!.frequency,
        weekdays: draft!.weekdays,
        variant: draft!.variant,
      });
      toast("Basket updated.");
      await onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${draft!.product.name} from your basket?`)) return;
    setBusy(true);
    try {
      await api.del(`/basket-lines/${draft!.id}/`);
      toast("Removed.");
      await onChanged();
      onClose();
    } catch {
      toast("Could not remove that item.", "error");
    } finally {
      setBusy(false);
    }
  }

  const set = (patch: Partial<BasketLine>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Sheet
      open={!!line}
      onClose={onClose}
      title={draft.product.name}
      footer={
        <div className="inline" style={{ flexWrap: "nowrap" }}>
          <button className="btn btn--primary" style={{ flex: 1 }} onClick={save} disabled={busy}>
            {busy ? <Spinner /> : null} Save
          </button>
          <button className="btn btn--danger" onClick={remove} disabled={busy}>
            Remove
          </button>
        </div>
      }
    >
      <div className="between mb-2">
        <span className="label" style={{ margin: 0 }}>
          How many
        </span>
        <div className="stepper">
          <button onClick={() => set({ quantity: Math.max(1, draft.quantity - 1) })} disabled={draft.quantity <= 1}>
            −
          </button>
          <span className="num">{draft.quantity}</span>
          <button onClick={() => set({ quantity: Math.min(20, draft.quantity + 1) })} disabled={draft.quantity >= 20}>
            +
          </button>
        </div>
      </div>

      <span className="label">Round</span>
      <div className="seg mb-2">
        {(["morning", "evening"] as const).map((s) => (
          <button
            key={s}
            className={`seg__b${draft.slot === s ? " seg__b--on" : ""}`}
            onClick={() => set({ slot: s })}
          >
            {draft.slot === s && <motion.span layoutId="line-slot" className="seg__bg" />}
            {slotLabel(s)}
          </button>
        ))}
      </div>

      <span className="label">How often</span>
      <div className="opts">
        {(["daily", "alternate", "weekdays", "monthly"] as const).map((f) => (
          <button
            key={f}
            className={`opt${draft.frequency === f ? " opt--on" : ""}`}
            onClick={() => set({ frequency: f, weekdays: f === "weekdays" && !draft.weekdays.length ? [0, 3] : draft.weekdays })}
          >
            <span className="opt__t">{frequencyLabel(f, [0, 3])}</span>
            {draft.frequency === f && (
              <span className="opt__tick">
                <Icon.tick />
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {draft.frequency === "weekdays" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <span className="label mt-2" style={{ display: "block" }}>
              Which days
            </span>
            <div className="days">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  className={`day${draft.weekdays.includes(index) ? " day--on" : ""}`}
                  onClick={() =>
                    set({
                      weekdays: draft.weekdays.includes(index)
                        ? draft.weekdays.filter((d) => d !== index)
                        : [...draft.weekdays, index].sort((a, b) => a - b),
                    })
                  }
                  aria-pressed={draft.weekdays.includes(index)}
                >
                  {label.slice(0, 2)}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="hint mt-2">
        {money(draft.unit_price)} each · about {money(Number(draft.unit_price) * draft.quantity)} per delivery.
      </p>
    </Sheet>
  );
}
