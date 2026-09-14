import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { ask } from "../components/Confirm";
import { AppBar } from "../components/Shell";
import { Empty, Icon, Sheet, Skeletons, Spinner } from "../components/ui";
import {
  ApiError,
  api,
  changedLines,
  type Basket as TBasket,
  type BasketLine,
  type CalendarDay,
  type CalendarLine,
} from "../lib/api";
import { WEEKDAYS, frequencyLabel, money, relativeDay, shortDate, slotLabel } from "../lib/format";
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
      // A cancelled basket has no calendar to reload.
      if (path !== "cancel") await loadCalendar(basket!.id);
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "That did not work.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const paused = basket.status === "paused";
  const todayLines = calendar?.[0]?.lines.filter((l) => l.quantity > 0) ?? [];
  // The farm's own dates, from the server's calendar, not the phone's clock.
  const tomorrow = calendar?.[1];
  const inAWeek = calendar?.[8];
  const tomorrowPacked = !!tomorrow && basket.lines.every((l) => tomorrow.locked.includes(l.slot));

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

      <div className="shell split split--even">
        <div className="stack">
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
                  disabled={busy || !tomorrow || tomorrowPacked}
                  title={tomorrowPacked ? "Tomorrow's rounds are already packed." : undefined}
                  onClick={() => tomorrow && void act("skip-day", { date: tomorrow.date }, "Tomorrow is off.")}
                >
                  Skip tomorrow
                </button>
                <button
                  className="btn btn--soft btn--sm"
                  disabled={busy || !inAWeek}
                  onClick={() => inAWeek && void act("pause", { resume_on: inAWeek.date }, "Paused for a week.")}
                >
                  Pause a week
                </button>
              </>
            )}
            {busy && <Spinner />}
          </div>

          {/* Today */}
          {todayLines.length > 0 && (
            <div>
              <h2 className="h3 mb-2">Today</h2>
              {todayLines.map((entry) => (
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

        </div>

        <div className="stack">
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

          {calendar && <ChangesList days={calendar} onPick={setDayOpen} />}

          <button
            className="btn btn--danger"
            disabled={busy}
            onClick={async () => {
              const sure = await ask({
                title: "Cancel your basket?",
                body: "Deliveries stop from the next open round — anything already packed still arrives. Your wallet balance stays yours.",
                confirm: "Cancel basket",
                cancel: "Keep it",
                danger: true,
              });
              if (sure && (await act("cancel", undefined, "Basket cancelled."))) navigate("/");
            }}
          >
            Cancel subscription
          </button>
        </div>
      </div>

      <DaySheet
        basket={basket}
        day={calendar?.find((d) => d.date === dayOpen) ?? null}
        onClose={() => setDayOpen(null)}
        onSaved={(days) => {
          setCalendar(days);
          void loadBaskets();
        }}
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
          const going = day.lines.filter((l) => l.quantity > 0);
          const count = going.reduce((n, l) => n + l.quantity, 0);
          const edited = changedLines(day).length > 0;
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
                  {going.slice(0, 3).map((l, i) => (
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

/* ── Changed days ──────────────────────────────────────────────────── */

function describeChange(l: CalendarLine) {
  if (l.quantity === 0) return `No ${l.name}`;
  if (l.usual === 0) return `${l.name} ${l.quantity} (extra)`;
  return `${l.name} ${l.quantity} (usually ${l.usual})`;
}

function ChangesList({ days, onPick }: { days: CalendarDay[]; onPick: (date: string) => void }) {
  const changed = days.map((day) => ({ day, lines: changedLines(day) })).filter((d) => d.lines.length > 0);

  return (
    <div>
      <div className="sectionhead">
        <h2 className="h3">Your changes</h2>
        {changed.length > 0 && (
          <span className="tiny muted">
            {changed.length} day{changed.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {changed.length === 0 ? (
        <p className="sm muted">Nothing changed. Tap a day in the calendar to change it, and it will be listed here.</p>
      ) : (
        <div className="stack flow-sm">
          {changed.map(({ day, lines }) => {
            const [y, m, d] = day.date.split("-").map(Number);
            const date = new Date(y, m - 1, d);
            const skipped = day.lines.every((l) => l.quantity === 0);
            return (
              <button key={day.date} className="row" onClick={() => onPick(day.date)}>
                <span className="row__art datetile">
                  <b>{d}</b>
                  <small>{date.toLocaleDateString("en-IN", { month: "short" })}</small>
                </span>
                <span className="row__main">
                  <span className="row__t">
                    {relativeDay(day.date)}
                    {skipped && (
                      <span className="tag tag--skipped" style={{ marginLeft: 8 }}>
                        Skipped
                      </span>
                    )}
                  </span>
                  <span className="row__s">{lines.map(describeChange).join(" · ")}</span>
                </span>
                <span className="row__end muted">
                  <Icon.chev />
                </span>
              </button>
            );
          })}
        </div>
      )}
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
  // Per line: a number sets that date, null drops back to the usual rhythm.
  const [draft, setDraft] = useState<Record<number, number | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft({}), [day?.date]);

  const rows = day
    ? basket.lines
        .filter((l) => l.is_active)
        .map((line) => {
          const entry = day.lines.find((e) => e.line === line.id);
          const usual = entry?.usual ?? 0;
          const saved = entry?.overridden ? entry.quantity : null;
          const current = line.id in draft ? draft[line.id] : saved;
          // A packed round shows what is actually going out, and cannot change.
          const packed = day.locked.includes(line.slot);
          const shown = packed ? (entry?.quantity ?? 0) : (current ?? usual);
          return { line, usual, saved, current, shown, packed, frozen: packed || day.paused };
        })
    : [];

  const dirty = Object.keys(draft).length > 0;
  const estimate =
    rows.reduce((sum, r) => sum + Number(r.line.unit_price) * r.shown, 0) * (1 - Number(basket.discount_percent) / 100);

  function change(row: (typeof rows)[number], value: number) {
    const next = value === row.usual ? null : value;
    setDraft((d) => {
      const copy = { ...d };
      if (next === row.saved) delete copy[row.line.id];
      else copy[row.line.id] = next;
      return copy;
    });
  }

  async function save() {
    setBusy(true);
    let days: CalendarDay[] | null = null;
    try {
      for (const [line, quantity] of Object.entries(draft)) {
        const res = await api.post<{ days: CalendarDay[] }>(`/subscriptions/${basket.id}/set-day/`, {
          line: Number(line),
          date: day!.date,
          quantity,
        });
        days = res.days;
        setDraft((d) => {
          const copy = { ...d };
          delete copy[Number(line)];
          return copy;
        });
      }
      toast(`${relativeDay(day!.date)} is updated.`);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save that day.", "error");
    } finally {
      if (days) onSaved(days);
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={!!day}
      onClose={onClose}
      title={day ? relativeDay(day.date) : ""}
      footer={
        day && rows.length > 0 ? (
          <button className="btn btn--primary btn--lg btn--block" onClick={save} disabled={!dirty || busy}>
            {busy ? <Spinner /> : null} {dirty ? "Save changes" : "No changes yet"}
          </button>
        ) : null
      }
    >
      {day && (
        <>
          {day.paused && (
            <p className="notice mb-2">Your basket is paused on this day. Resume it to change anything.</p>
          )}
          <p className="sm muted" style={{ marginBottom: "var(--sp-4)" }}>
            {shortDate(day.date)} ·{" "}
            {dirty
              ? estimate > 0
                ? `${money(estimate)} after saving`
                : "nothing after saving"
              : Number(day.total) > 0
                ? money(day.total)
                : "nothing scheduled"}
          </p>

          <div className="stack flow-sm">
            {rows.map((row) => (
              <div key={row.line.id} className="card card--pad" style={{ padding: "var(--sp-4)" }}>
                <div className="between">
                  <div style={{ minWidth: 0 }}>
                    <div className="row__t">{row.line.product.name}</div>
                    <div className="row__s">
                      {row.line.product.variant_label} · {slotLabel(row.line.slot)}
                    </div>
                  </div>
                  <div className="stepper">
                    <button
                      onClick={() => change(row, row.shown - 1)}
                      disabled={busy || row.frozen || row.shown === 0}
                      aria-label={`One less ${row.line.product.name}`}
                    >
                      −
                    </button>
                    <span className="num" aria-live="polite">
                      {row.shown}
                    </span>
                    <button
                      onClick={() => change(row, row.shown + 1)}
                      disabled={busy || row.frozen || row.shown >= 20}
                      aria-label={`One more ${row.line.product.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
                {row.packed && (
                  <p className="tiny muted" style={{ marginTop: 10 }}>
                    Packed — the {row.line.slot} round {row.line.slot === "morning" ? "closed at 9 pm the night before" : "closed at 1 pm"}.
                  </p>
                )}
                {row.current !== null && !row.frozen && (
                  <button className="linkish" style={{ marginTop: 10 }} disabled={busy} onClick={() => change(row, row.usual)}>
                    Reset to usual (
                    {row.usual
                      ? `${row.usual} × ${frequencyLabel(row.line.frequency, row.line.weekdays).toLowerCase()}`
                      : "none on this day"}
                    )
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
    const sure = await ask({
      title: `Remove ${draft!.product.name}?`,
      body: "It stops from the next open round. Past deliveries stay in your history.",
      confirm: "Remove",
      cancel: "Keep it",
      danger: true,
    });
    if (!sure) return;
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
