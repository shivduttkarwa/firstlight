import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { photo, type PhotoKey } from "../lib/photos";
import { toast } from "../store/useStore";
import { Icon } from "./ui";

interface Offer {
  id: string;
  tab: string;
  eyebrow: string;
  title: string;
  body: string;
  save: string;
  saveNote: string;
  code: string;
  perks: string[];
  photo: PhotoKey;
  accent: string;
  to: string;
  cta: string;
  hours: number;
}

const OFFERS: Offer[] = [
  {
    id: "first-month",
    tab: "First month",
    eyebrow: "New subscribers",
    title: "Your first month, a fifth lighter",
    body: "Start any package before Sunday's round closes and we take twenty per cent off month one. Same herd, same gate, same six o'clock.",
    save: "20%",
    saveNote: "off month one",
    code: "FIRSTLIGHT20",
    perks: ["Any package", "Pause any day", "No delivery fee"],
    photo: "pour",
    accent: "#c6f24b",
    to: "/packages",
    cta: "Start a subscription",
    hours: 68,
  },
  {
    id: "ghee",
    tab: "Bilona ghee",
    eyebrow: "From the shed",
    title: "A jar of bilona ghee, on the farm",
    body: "Baskets over two thousand a month get their first 250 ml jar free, hand-churned from the same morning's cream and never bought in.",
    save: "FREE",
    saveNote: "250 ml jar",
    code: "GHEEFREE",
    perks: ["Baskets over ₹2,000", "Churned Thursdays", "One per household"],
    photo: "ghee",
    accent: "#e8b04b",
    to: "/shop",
    cta: "Open the shop",
    hours: 140,
  },
  {
    id: "refer",
    tab: "Refer a neighbour",
    eyebrow: "Both of you",
    title: "Send us next door, drink a week free",
    body: "Every neighbour who starts on your code lands ₹200 in their wallet, and a week of milk lands in yours. The round gets shorter for everyone.",
    save: "₹200",
    saveNote: "each way",
    code: "NEIGHBOUR",
    perks: ["Unlimited referrals", "Credited in 24 hours", "Any package"],
    photo: "road",
    accent: "#4fd6a0",
    to: "/account/wallet",
    cta: "See your wallet",
    hours: 300,
  },
  {
    id: "curd",
    tab: "Weekend curd",
    eyebrow: "Evening round only",
    title: "Two pots of set curd, one price",
    body: "Saturday and Sunday, order a 400 g pot of set curd on the evening round and the second pot is on the farm. Set overnight, never yesterday's.",
    save: "1+1",
    saveNote: "on set curd",
    code: "WEEKENDCURD",
    perks: ["Sat & Sun", "Evening slot", "400 g pots"],
    photo: "curd",
    accent: "#8fb6ff",
    to: "/shop",
    cta: "Add set curd",
    hours: 41,
  },
];

const AUTOPLAY = 7200;

/* The clocks are pinned to when the app loaded, so changing slides doesn't
   quietly restart the countdown. */
const OPENED = Date.now();

export function Offers() {
  const still = useReducedMotion();
  const [[i, dir], setSlide] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const offer = OFFERS[i];

  const go = (step: number) => setSlide(([n]) => [(n + step + OFFERS.length) % OFFERS.length, step]);
  const jump = (n: number) => setSlide(([c]) => [n, n < c ? -1 : 1]);

  useEffect(() => {
    if (still || paused) return;
    const t = setTimeout(() => setSlide(([n]) => [(n + 1) % OFFERS.length, 1]), AUTOPLAY);
    return () => clearTimeout(t);
  }, [i, still, paused]);

  useEffect(() => setCopied(false), [i]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      toast(`Code ${offer.code} copied`);
    } catch {
      toast("Could not copy the code", "error");
    }
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    go(e.key === "ArrowRight" ? 1 : -1);
  }

  const slide: Variants = still
    ? {
        enter: { opacity: 0 },
        on: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
      }
    : {
        enter: (d: number) => ({ opacity: 0, x: d * 56, scale: 0.985 }),
        on: {
          opacity: 1,
          x: 0,
          scale: 1,
          transition: {
            duration: 0.55,
            ease: [0.2, 0.8, 0.2, 1],
            staggerChildren: 0.055,
            delayChildren: 0.1,
          },
        },
        exit: (d: number) => ({
          opacity: 0,
          x: d * -56,
          scale: 0.985,
          transition: { duration: 0.3, ease: "easeIn" },
        }),
      };

  const line: Variants = still
    ? { enter: {}, on: {}, exit: {} }
    : {
        enter: { opacity: 0, y: 18 },
        on: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
        exit: { opacity: 0 },
      };

  return (
    <section
      className="offers"
      style={{ "--offer": offer.accent } as CSSProperties}
      aria-labelledby="offers-title"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="offers__aura" aria-hidden="true">
        <i />
        <i />
      </div>

      <div className="shell">
        <header className="offers__head">
          <div>
            <span className="eyebrow">This week at the gate</span>
            <h2 className="h2 mt-1" id="offers-title">
              Offers worth waking up for
            </h2>
            <span className="offers__live">
              <i />
              {OFFERS.length} running now
            </span>
          </div>

          <div className="offers__nav">
            <span className="offers__count num">
              <b>{String(i + 1).padStart(2, "0")}</b> / {String(OFFERS.length).padStart(2, "0")}
            </span>
            <button type="button" className="offers__arrow" onClick={() => go(-1)} aria-label="Previous offer">
              <Icon.back />
            </button>
            <button type="button" className="offers__arrow" onClick={() => go(1)} aria-label="Next offer">
              <Icon.chev />
            </button>
          </div>
        </header>

        <motion.div
          className="offers__stage"
          role="region"
          aria-roledescription="carousel"
          aria-label="Offers"
          tabIndex={0}
          onKeyDown={onKey}
          drag={still ? false : "x"}
          dragDirectionLock
          dragElastic={0.14}
          dragConstraints={{ left: 0, right: 0 }}
          dragSnapToOrigin
          onDragEnd={(_, info) => {
            const flick = info.offset.x + info.velocity.x * 0.2;
            if (flick < -80) go(1);
            else if (flick > 80) go(-1);
          }}
        >
          <AnimatePresence initial={false} custom={dir}>
            <motion.article
              key={offer.id}
              className="offer"
              custom={dir}
              variants={slide}
              initial="enter"
              animate="on"
              exit="exit"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${OFFERS.length}: ${offer.title}`}
            >
              <motion.div className="offer__media" variants={line}>
                <img {...photo(offer.photo, 880, 700, "(min-width: 900px) 600px, 92vw")} alt="" />
                <span className="offer__wash" />

                <div className="offer__seal">
                  <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
                    <defs>
                      <path
                        id={`seal-${offer.id}`}
                        fill="none"
                        d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0"
                      />
                    </defs>
                    <text>
                      <textPath href={`#seal-${offer.id}`}>· FIRSTLIGHT · SAVE · LIMITED RUN&nbsp;</textPath>
                    </text>
                  </svg>
                  <span className="offer__sealv">{offer.save}</span>
                  <span className="offer__sealk">{offer.saveNote}</span>
                </div>

                <Clock endsAt={OPENED + offer.hours * 3600000} />
              </motion.div>

              <div className="offer__copy">
                <motion.span className="eyebrow" variants={line}>
                  {offer.eyebrow}
                </motion.span>
                <motion.h3 className="display offer__title" variants={line}>
                  {offer.title}
                </motion.h3>
                <motion.p className="lede offer__body" variants={line}>
                  {offer.body}
                </motion.p>

                <motion.ul className="offer__perks" variants={line}>
                  {offer.perks.map((p) => (
                    <li key={p}>
                      <Icon.tick />
                      {p}
                    </li>
                  ))}
                </motion.ul>

                <motion.div className="offer__coupon" variants={line}>
                  <span className="offer__couponk">
                    <span className="tiny">Use code</span>
                    <span className="offer__code">{offer.code}</span>
                  </span>
                  <button type="button" className="offer__copybtn" onClick={copyCode}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={copied ? "yes" : "no"}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.6 }}
                        transition={{ duration: 0.16 }}
                      >
                        {copied ? <Icon.tick /> : <Icon.copy />}
                      </motion.span>
                    </AnimatePresence>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </motion.div>

                <motion.div className="inline offer__acts" variants={line}>
                  <Link
                    to={offer.to}
                    className="btn btn--primary btn--lg"
                    style={{ "--btn-bg": offer.accent, "--btn-fg": "var(--pine-950)" } as CSSProperties}
                  >
                    {offer.cta} <Icon.arrow />
                  </Link>
                  <Link to="/how-it-works" className="btn btn--ghost btn--lg">
                    How it works
                  </Link>
                </motion.div>
              </div>
            </motion.article>
          </AnimatePresence>
        </motion.div>

        <div className="offers__tabs" role="tablist" aria-label="Choose an offer">
          {OFFERS.map((o, n) => (
            <button
              type="button"
              key={o.id}
              role="tab"
              aria-selected={n === i}
              className={`offers__tab${n === i ? " offers__tab--on" : ""}`}
              onClick={() => jump(n)}
            >
              {n === i && !still && (
                <motion.i
                  key={`${i}-${paused}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: paused ? 0.001 : 1 }}
                  transition={{ duration: paused ? 0 : AUTOPLAY / 1000, ease: "linear" }}
                />
              )}
              <em className="num">{String(n + 1).padStart(2, "0")}</em>
              <span>{o.tab}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Clock({ endsAt }: { endsAt: number }) {
  const [left, setLeft] = useState(() => Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    setLeft(Math.max(0, endsAt - Date.now()));
    const t = setInterval(() => setLeft(Math.max(0, endsAt - Date.now())), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  const s = Math.floor(left / 1000);
  const cells = [
    { k: "days", v: Math.floor(s / 86400) },
    { k: "hrs", v: Math.floor(s / 3600) % 24 },
    { k: "min", v: Math.floor(s / 60) % 60 },
    { k: "sec", v: s % 60 },
  ];

  return (
    <div className="offer__clock">
      <span className="offer__clockk">Ends in</span>
      <div className="offer__cells">
        {cells.map((c) => (
          <span className="offer__cell" key={c.k}>
            <span className="offer__cellv num">
              <motion.b
                key={c.v}
                initial={{ y: "-80%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              >
                {String(c.v).padStart(2, "0")}
              </motion.b>
            </span>
            <span className="offer__cellk">{c.k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
