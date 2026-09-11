import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { AppBar } from "../../components/Shell";
import { Empty, Icon, Skeletons, Spinner } from "../../components/ui";
import { ApiError, api, type Round, type RoundStop, type Slot } from "../../lib/api";
import { addDays, money, parseISO, relativeDay, toISO } from "../../lib/format";
import { toast } from "../../store/useStore";

export function FarmRound() {
  const [date, setDate] = useState(toISO(new Date()));
  const [slot, setSlot] = useState<Slot>(new Date().getHours() < 14 ? "morning" : "evening");
  const [round, setRound] = useState<Round | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRound(await api.get<Round>(`/farm/round/?date=${date}&slot=${slot}`));
    } catch {
      setRound(null);
      toast("Could not load the round.", "error");
    }
  }, [date, slot]);

  useEffect(() => {
    setRound(null);
    void load();
  }, [load]);

  async function mark(stop: RoundStop, status: "delivered" | "failed") {
    setBusy(stop.address_id);
    try {
      // Mark what is still open. Only when nothing is open is it a correction —
      // then the items not already at this status change (the server refunds
      // or charges once, never twice).
      const open = stop.items.filter((i) => i.status === "scheduled" || i.status === "out_for_delivery");
      const items = open.length ? open : stop.items.filter((i) => i.status !== status);
      if (!items.length) return;
      await api.post("/farm/round/mark/", { delivery_ids: items.map((i) => i.delivery_id), status });
      toast(status === "delivered" ? `${stop.customer} done.` : `Marked not delivered.`);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not update.", "error");
    } finally {
      setBusy(null);
    }
  }

  const progress = round ? (round.totals.items ? round.totals.done / round.totals.items : 0) : 0;

  return (
    <>
      <AppBar
        title="Today's round"
        right={
          <button className="iconbtn iconbtn--filled" onClick={() => void load()} aria-label="Refresh">
            <Icon.refresh />
          </button>
        }
      />

      <div className="shell">
        {/* Day picker */}
        <div className="inline" style={{ flexWrap: "nowrap", gap: "var(--sp-2)" }}>
          <button className="iconbtn iconbtn--filled" onClick={() => setDate(toISO(addDays(parseISO(date), -1)))} aria-label="Previous day">
            <Icon.back />
          </button>
          <div style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)" }}>{relativeDay(date)}</div>
            <input
              type="date"
              className="tiny muted"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: 0, background: "transparent", textAlign: "center", width: "100%" }}
            />
          </div>
          <button
            className="iconbtn iconbtn--filled"
            onClick={() => setDate(toISO(addDays(parseISO(date), 1)))}
            aria-label="Next day"
            style={{ transform: "rotate(180deg)" }}
          >
            <Icon.back />
          </button>
        </div>

        {/* Slot */}
        <div className="seg mt-2">
          {(["morning", "evening"] as const).map((s) => (
            <button key={s} className={`seg__b${slot === s ? " seg__b--on" : ""}`} onClick={() => setSlot(s)}>
              {slot === s && <motion.span layoutId="round-slot" className="seg__bg" />}
              <span className="inline" style={{ gap: 6, flexWrap: "nowrap" }}>
                {s === "morning" ? <Icon.sun /> : <Icon.moon />}
                {s === "morning" ? "Morning" : "Evening"}
              </span>
            </button>
          ))}
        </div>

        {/* Progress */}
        {round && round.totals.items > 0 && (
          <div className="card card--pad mt-3" style={{ background: "var(--panel)", color: "var(--on-panel)" }}>
            <div className="between">
              <span className="eyebrow eyebrow--bare" style={{ color: "var(--on-panel-dim)" }}>
                {round.totals.done} of {round.totals.items} done
              </span>
              <span className="num" style={{ fontWeight: 700 }}>
                {money(round.totals.value)}
              </span>
            </div>
            <div
              style={{
                height: 8,
                borderRadius: 99,
                background: "rgba(242,235,223,0.16)",
                marginTop: 10,
                overflow: "hidden",
              }}
            >
              <motion.div
                animate={{ width: `${progress * 100}%` }}
                transition={{ type: "spring", damping: 26, stiffness: 200 }}
                style={{ height: "100%", background: "var(--accent)", borderRadius: 99 }}
              />
            </div>
            <div className="sm mt-2" style={{ color: "var(--on-panel-dim)" }}>
              {round.totals.stops} stop{round.totals.stops === 1 ? "" : "s"} · {round.totals.pending} left
            </div>
          </div>
        )}

        {/* Stops */}
        <div className="mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
          {round === null ? (
            <Skeletons count={4} height={78} />
          ) : round.stops.length === 0 ? (
            <Empty title="Nothing on this round" body="No deliveries are scheduled for this day and slot." />
          ) : (
            <div className="stack flow-sm">
              {round.stops.map((stop, i) => (
                <StopCard
                  key={stop.address_id}
                  stop={stop}
                  index={i + 1}
                  open={open === stop.address_id}
                  busy={busy === stop.address_id}
                  onToggle={() => setOpen(open === stop.address_id ? null : stop.address_id)}
                  onMark={mark}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StopCard({
  stop,
  index,
  open,
  busy,
  onToggle,
  onMark,
}: {
  stop: RoundStop;
  index: number;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onMark: (stop: RoundStop, status: "delivered" | "failed") => void;
}) {
  const done = stop.status === "done";
  return (
    <div className={`stop${done ? " stop--done" : ""}`}>
      <button className="stop__head" onClick={onToggle} aria-expanded={open}>
        <span className="stop__n" style={done ? { background: "var(--ok)" } : undefined}>
          {done ? <Icon.tick /> : index}
        </span>
        <span className="row__main">
          <span className="row__t">{stop.customer}</span>
          <span className="row__s">
            {stop.line1}
            {stop.landmark ? `, ${stop.landmark}` : ""}
          </span>
        </span>
        <span className="row__end">
          <span className="num" style={{ fontWeight: 700 }}>
            {money(stop.value)}
          </span>
          {stop.wallet_low && (
            <span className="tag tag--failed" style={{ display: "block", marginTop: 3 }}>
              low wallet
            </span>
          )}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="stop__body">
              {stop.items.map((item) => (
                <div key={item.delivery_id} className="stop__item">
                  <span className="stop__qty" style={{ background: `color-mix(in srgb, ${item.accent} 30%, var(--surface))` }}>
                    {item.quantity}×
                  </span>
                  <span className="row__main">
                    <span className="row__t sm">{item.product}</span>
                    <span className="row__s tiny">{item.variant_label}</span>
                  </span>
                  <span className={`tag tag--${item.status}`}>{item.status}</span>
                </div>
              ))}

              <div className="rule" style={{ marginBlock: "var(--sp-3)" }} />

              <div className="between sm">
                <span className="muted">Wallet</span>
                <span className={`num ${stop.wallet_low ? "" : "muted"}`} style={stop.wallet_low ? { color: "var(--bad)", fontWeight: 700 } : undefined}>
                  {money(stop.wallet_balance)}
                </span>
              </div>
              {stop.note && (
                <p className="tiny muted mt-1" style={{ fontStyle: "italic" }}>
                  “{stop.note}”
                </p>
              )}

              <div className="inline mt-3" style={{ flexWrap: "nowrap" }}>
                <a href={`tel:${stop.phone}`} className="btn btn--soft btn--sm" aria-label={`Call ${stop.customer}`}>
                  <Icon.phone /> Call
                </a>
                {!done && (
                  <>
                    <button className="btn btn--primary btn--sm" style={{ flex: 1 }} disabled={busy} onClick={() => onMark(stop, "delivered")}>
                      {busy ? <Spinner /> : <Icon.tick />} Delivered
                    </button>
                    <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => onMark(stop, "failed")}>
                      Missed
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
