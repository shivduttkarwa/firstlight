import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { offerImage, type OfferPhotoKey } from "../lib/photos";
import { toast, useAuth, useOffer } from "../store/useStore";
import { Icon } from "./ui";

interface Offer {
  id: string;
  tab: string;
  eyebrow: string;
  title: string;
  body: string;
  save: string;
  saveNote: string;
  /** Empty for the neighbour offer, where each household shares its own code. */
  code: string;
  perks: string[];
  photo: OfferPhotoKey;
  accent: string;
  to: string;
  cta: string;
  hours: number;
}

const OFFERS: Offer[] = [
  {
    id: "first-month",
    tab: "First month",
    eyebrow: "New households",
    title: "Your first month, a fifth lighter",
    body: "Start any package and we put twenty per cent of your first month straight into your wallet. Same herd, same gate, same six o'clock.",
    save: "20%",
    saveNote: "of month one",
    code: "FIRSTLIGHT20",
    perks: ["Any package", "Credited on the spot", "No delivery fee"],
    photo: "offer-first-month-delivery",
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
    body: "Baskets that come to ₹2,000 a month or more get a 250 g jar's worth in the wallet, hand-churned from the same morning's cream.",
    save: "FREE",
    saveNote: "250 g jar",
    code: "GHEEFREE",
    perks: ["Baskets over ₹2,000", "Once per household", "Credited on the spot"],
    photo: "offer-bilona-ghee",
    accent: "#e8b04b",
    to: "/shop",
    cta: "Open the shop",
    hours: 140,
  },
  {
    id: "refer",
    tab: "Refer a neighbour",
    eyebrow: "Both of you",
    title: "Send us next door, both get ₹200",
    body: "Share your code. Your neighbour gets ₹200 in their wallet when they join, and ₹200 lands in yours after their first delivery.",
    save: "₹200",
    saveNote: "each way",
    code: "",
    perks: ["Unlimited neighbours", "Paid after their first delivery", "Any package"],
    photo: "offer-refer-neighbour",
    accent: "#4fd6a0",
    to: "/account/wallet",
    cta: "See your wallet",
    hours: 300,
  },
];

const AUTOPLAY = 7200;
const SPLIT: Transition = { duration: 1, ease: [0.7, 0, 0.3, 1] };

/* The clocks are pinned to when the app loaded, so changing slides doesn't
   quietly restart the countdown. */
const OPENED = Date.now();

export function Offers() {
  const still = useReducedMotion();
  const referralCode = useAuth((s) => s.user?.referral_code ?? "");
  const pickCode = useOffer((s) => s.setCode);
  const [[i, dir], setSlide] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);

  const offer = OFFERS[i];
  const code = offer.code || referralCode;

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
    if (offer.code) pickCode(offer.code);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast(offer.code ? `${code} copied. It fills in when you start.` : `Your code ${code} is copied. Send it to a neighbour.`);
    } catch {
      toast(offer.code ? `${code} will fill in when you start.` : "Could not copy the code", offer.code ? "info" : "error");
    }
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    go(e.key === "ArrowRight" ? 1 : -1);
  }

  // The left half of the photo travels one way and the right half the other.
  const half = (sign: 1 | -1): Variants =>
    still
      ? {
          enter: { opacity: 0 },
          on: { opacity: 1, transition: { duration: 0.3 } },
          exit: { opacity: 0, transition: { duration: 0.3 } },
        }
      : {
          enter: (d: number) => ({ y: `${d * sign * 100}%` }),
          on: { y: "0%", transition: SPLIT },
          exit: (d: number) => ({ y: `${d * sign * -100}%`, transition: SPLIT }),
        };

  const copy: Variants = still
    ? {
        enter: { opacity: 0 },
        on: { opacity: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, transition: { duration: 0.15 } },
      }
    : {
        enter: (d: number) => ({ opacity: 0, y: d * 40 }),
        on: { opacity: 1, y: 0, transition: { ...SPLIT, staggerChildren: 0.05, delayChildren: 0.2 } },
        exit: (d: number) => ({ opacity: 0, y: d * -40, transition: { duration: 0.45, ease: [0.7, 0, 0.84, 0] } }),
      };

  const seal: Variants = still
    ? { enter: { opacity: 0 }, on: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        enter: (d: number) => ({ opacity: 0, y: d * 14 }),
        on: { opacity: 1, y: 0, transition: SPLIT },
        exit: (d: number) => ({ opacity: 0, y: d * -14, transition: { duration: 0.4 } }),
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
          <article
            className="offer"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${OFFERS.length}: ${offer.title}`}
          >
            <div className="offer__media">
              {([1, -1] as const).map((sign) => (
                <AnimatePresence key={sign} initial={false} custom={dir}>
                  <motion.img
                    key={offer.id}
                    {...offerImage(offer.photo)}
                    alt=""
                    className={`offer__half offer__half--${sign === 1 ? "left" : "right"}`}
                    custom={dir}
                    variants={half(sign)}
                    initial="enter"
                    animate="on"
                    exit="exit"
                  />
                </AnimatePresence>
              ))}
              <span className="offer__wash" />

              <div className="offer__seal">
                <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
                  <defs>
                    <path
                      id="offer-seal-path"
                      fill="none"
                      d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0"
                    />
                  </defs>
                  <text>
                    <textPath href="#offer-seal-path">· FIRSTLIGHT · SAVE · LIMITED RUN&nbsp;</textPath>
                  </text>
                </svg>
                <AnimatePresence initial={false} custom={dir}>
                  <motion.span
                    key={offer.id}
                    className="offer__sealin"
                    custom={dir}
                    variants={seal}
                    initial="enter"
                    animate="on"
                    exit="exit"
                  >
                    <span className="offer__sealv">{offer.save}</span>
                    <span className="offer__sealk">{offer.saveNote}</span>
                  </motion.span>
                </AnimatePresence>
              </div>

              <Clock endsAt={OPENED + offer.hours * 3600000} />
            </div>

            <div className="offer__copies">
              <AnimatePresence initial={false} custom={dir}>
                <motion.div
                  key={offer.id}
                  className="offer__copy"
                  custom={dir}
                  variants={copy}
                  initial="enter"
                  animate="on"
                  exit="exit"
                >
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
                      <span className="tiny">{offer.code ? "Use code" : "Your code"}</span>
                      <span className="offer__code">{code || "••••••"}</span>
                    </span>
                    {code ? (
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
                    ) : (
                      <Link to="/login?next=/account/wallet" className="offer__copybtn">
                        Sign in
                      </Link>
                    )}
                  </motion.div>

                  <motion.div className="inline offer__acts" variants={line}>
                    <Link
                      to={offer.to}
                      onClick={() => offer.code && pickCode(offer.code)}
                      className="btn btn--primary btn--lg"
                      style={{ "--btn-bg": offer.accent, "--btn-fg": "var(--pine-950)" } as CSSProperties}
                    >
                      {offer.cta} <Icon.arrow />
                    </Link>
                    <Link to="/how-it-works" className="btn btn--ghost btn--lg">
                      How it works
                    </Link>
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
          </article>
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
