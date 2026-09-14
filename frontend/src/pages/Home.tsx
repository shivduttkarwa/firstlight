import { motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Offers } from "../components/Offers";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Icon, Reveal } from "../components/ui";
import {
  api,
  cachedHomeContent,
  fetchHomeContent,
  type CmsBlock,
  type HomeContent,
  type Package,
  type Product,
  type Summary,
} from "../lib/api";
import { greeting, money, relativeDay, richTextToParagraphs, slotLabel, slotTime } from "../lib/format";
import { HERO_SLIDES, STEP_PHOTOS, heroImage, photo } from "../lib/photos";
import { useAuth, useSignedIn } from "../store/useStore";

function blockOf<T extends CmsBlock["type"]>(body: CmsBlock[] | undefined, type: T) {
  return body?.find((b) => b.type === type) as Extract<CmsBlock, { type: T }> | undefined;
}

const FALLBACK_STATS: Extract<CmsBlock, { type: "stats" }>["value"] = [
  { value: "90 min", label: "From udder to doorstep" },
  { value: "4.30 am", label: "First milking begins" },
  { value: "2", label: "Deliveries every day" },
  { value: "0", label: "Days spent in a warehouse" },
];

const FALLBACK_PROCESS: Extract<CmsBlock, { type: "process" }>["value"] = [
  {
    time: "4.30 am",
    title: "The shed wakes",
    body: "Our cows and buffaloes are milked by hand and machine in the same hour, every day of the year.",
  },
  {
    time: "5.15 am",
    title: "Straight into steel",
    body: "No holding tank, no powder, no water. Milk goes from the pail into chilled steel cans.",
  },
  {
    time: "5.30 am",
    title: "On the road",
    body: "Cans leave the farm at Village 11 SHPD while the milk is still warm from the animal.",
  },
  {
    time: "6.00 am",
    title: "At your gate",
    body: "Poured into your own vessel or sealed pouches, whichever you asked for.",
  },
];

const FALLBACK_STORY = [
  "Firstlight is a single farm in Sriganganagar district, not a collection centre. The animals you are buying from are the ones standing in our shed. There is no aggregator, no chilling plant, no three-day journey in a tanker.",
  "What that means for you is simple: the milk on your stove this morning was inside an animal ninety minutes ago.",
];

export function Home() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const signedIn = useSignedIn();
  const baskets = useAuth((s) => s.baskets);
  const [content, setContent] = useState<HomeContent | null>(cachedHomeContent);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void fetchHomeContent().then((fresh) => fresh && setContent(fresh));
    void api.get<Product[]>("/products/").then(setProducts).catch(() => setProducts([]));
    void api.get<Package[]>("/packages/").then(setPackages).catch(() => setPackages([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    void api.get<Summary>("/deliveries/summary/").then(setSummary).catch(() => undefined);
  }, [user]);

  // Until the farm's words arrive, the seeded ones hold the page's shape, so nothing jumps mid-scroll.
  const stats = content ? (blockOf(content.body, "stats")?.value ?? []) : FALLBACK_STATS;
  const process = content ? (blockOf(content.body, "process")?.value ?? []) : FALLBACK_PROCESS;
  const story = content ? richTextToParagraphs(content.story_body ?? "") : FALLBACK_STORY;
  const basket = baskets[0];

  return (
    <>
      {/* Signed out, the bar floats over the hero photograph. */}
      <AppBar over={!signedIn} />

      {signedIn ? (
        <section className="shell dash" style={{ paddingTop: "var(--sp-2)" }}>
          <motion.div
            className="dash__hello"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="eyebrow eyebrow--bare muted">{greeting()}</p>
            <h1 className="display" style={{ marginTop: 2 }}>
              {user?.full_name?.split(" ")[0] || "Welcome"}.
            </h1>
          </motion.div>

          <div className="mt-3 dash__next">
            <NextDeliveryCard summary={summary} pending={summary === null && (!!basket || !ready)} />
          </div>

          <div className="tiles mt-2 dash__tiles">
            <Link to="/account/wallet" className="tile">
              <div className="tile__k">Wallet</div>
              <div className="tile__v num">{money(summary?.wallet_balance ?? user?.wallet_balance ?? 0)}</div>
            </Link>
            <Link to="/basket" className="tile">
              <div className="tile__k">In your basket</div>
              <div className="tile__v num">{basket ? basket.item_count : 0}</div>
            </Link>
          </div>

          {(basket || !ready) && (
            <Link to="/basket" className="row mt-2 dash__row">
              <span className="row__art" style={{ background: "var(--accent-soft)" }}>
                <Icon.calendar />
              </span>
              <span className="row__main">
                <span className="row__t">
                  {!basket
                    ? "\u00a0"
                    : basket.status === "paused"
                      ? "Your basket is paused"
                      : "About " + money(basket.monthly_estimate) + " a month"}
                </span>
                <span className="row__s">
                  {basket
                    ? `${basket.item_count} item${basket.item_count === 1 ? "" : "s"} · ${basket.address_summary}`
                    : "\u00a0"}
                </span>
              </span>
              <span className="row__end muted">
                <Icon.chev />
              </span>
            </Link>
          )}
        </section>
      ) : (
        <Hero content={content} />
      )}

      <Offers />

      {(packages === null || packages.length > 0) && (
        <section className="sect" style={{ paddingBottom: 0 }}>
          <div className="shell sectionhead">
            <h2 className="h3">{signedIn ? "Add a package" : "Start in two taps"}</h2>
            <Link to="/packages" className="linkish">
              See all
            </Link>
          </div>
          <div className="shell">
            <div className="rail">
              {packages
                ? packages.map((p) => <PackageCard key={p.id} pkg={p} />)
                : [0, 1].map((n) => <PackageCardSkeleton key={n} />)}
            </div>
          </div>
        </section>
      )}

      <section className="sect" style={{ paddingBottom: 0 }}>
        <div className="shell sectionhead">
          <h2 className="h3">From the shed</h2>
          <Link to="/shop" className="linkish">
            All products
          </Link>
        </div>
        <div className="shell">
          <div className="rail rail--tiles">
            {products
              ? products.map((p) => <ProductTile key={p.id} product={p} />)
              : [0, 1, 2, 3].map((n) => <ProductTileSkeleton key={n} />)}
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="sect">
          <div className="shell">
            <Reveal>
              <div className="card card--pad" style={{ background: "var(--panel)", color: "var(--on-panel)" }}>
                <span className="eyebrow eyebrow--bare" style={{ color: "var(--on-panel-dim)" }}>
                  Firstlight in numbers
                </span>
                <div className="statgrid">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "var(--t-xl)",
                          lineHeight: 1,
                          color: "var(--accent)",
                        }}
                      >
                        {s.value}
                      </div>
                      <div className="tiny" style={{ color: "var(--on-panel-dim)", marginTop: 4 }}>
                        {s.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {process.length > 0 && <Morning steps={process} />}

      <section className="sect" style={{ paddingTop: 0 }}>
        <div className="shell">
          <Reveal className="story">
            <div className="figure story__fig">
              <img {...photo("field", 960, 720, "(min-width: 900px) 680px, 92vw")} />
              <div className="figure__over">
                <span className="eyebrow">Sriganganagar, 5.10 am</span>
              </div>
            </div>
            <div className="card card--pad story__text">
              <span className="eyebrow">Why us</span>
              <h2 className="h3 mt-1">{content?.story_heading ?? "One farm. Two milkings."}</h2>
              {story.slice(0, 2).map((p, i) => (
                <p key={i} className="muted mt-1" style={{ fontSize: "var(--t-sm)" }}>
                  {p}
                </p>
              ))}
              <div className="inline mt-2">
                <Link to="/the-farm" className="btn btn--soft btn--sm">
                  The farm <Icon.arrow />
                </Link>
                <Link to="/how-it-works" className="btn btn--ghost btn--sm">
                  How it works
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {!signedIn && (
        <section className="shell" style={{ paddingBottom: "var(--sp-10)" }}>
          <Reveal>
            <div className="ctaband">
              <div className="ctaband__copy">
                <span className="eyebrow">Ready when you are</span>
                <h2 className="h2 mt-1">Milk at your gate before six.</h2>
                <p className="mt-1">Pick a package in two taps. Skip, pause or change any day — no lock-in.</p>
              </div>
              <div className="ctaband__actions">
                <Link to="/packages" className="btn btn--primary btn--lg">
                  Start a subscription <Icon.arrow />
                </Link>
                <Link to="/shop" className="btn btn--lg ctaband__ghost">
                  Browse the shop
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      )}
    </>
  );
}

function NextDeliveryCard({ summary, pending }: { summary: Summary | null; pending: boolean }) {
  const next = summary?.next_delivery;
  if (!next && !pending) {
    return (
      <div className="card card--pad">
        <span className="eyebrow">Next delivery</span>
        <p className="muted mt-1" style={{ fontSize: "var(--t-sm)" }}>
          Nothing on the roster yet.
        </p>
        <Link to="/packages" className="btn btn--primary btn--sm mt-2">
          Set up a basket
        </Link>
      </div>
    );
  }
  return (
    <motion.div
      className="card card--pad card--raised"
      aria-busy={!next}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08 }}
      style={{ background: "var(--panel)", color: "var(--on-panel)" }}
    >
      <div className="between">
        <span className="eyebrow eyebrow--bare" style={{ color: "var(--on-panel-dim)" }}>
          Next delivery
        </span>
        <span style={{ color: "var(--accent)", width: 20, height: 20 }}>
          {next?.slot === "evening" ? <Icon.moon /> : <Icon.sun />}
        </span>
      </div>
      <div
        style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-xl)", lineHeight: 1.05, marginTop: 8 }}
      >
        {next ? `${relativeDay(next.date)}, ${slotLabel(next.slot).toLowerCase()}` : "\u00a0"}
      </div>
      <div className="sm" style={{ color: "var(--on-panel-dim)", marginTop: 4 }}>
        {next ? slotTime(next.slot) : "\u00a0"}
      </div>
      <div
        style={{
          marginTop: "var(--sp-4)",
          paddingTop: "var(--sp-3)",
          borderTop: "1px solid rgba(242,235,223,0.14)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="sm" style={{ color: "var(--on-panel-dim)" }}>
          {next ? `${next.product.name} · ${next.product.variant_label} × ${next.quantity}` : "\u00a0"}
        </span>
        <span className="num" style={{ fontWeight: 700 }}>
          {next ? money(next.total) : "\u00a0"}
        </span>
      </div>
    </motion.div>
  );
}

const TICKER = [
  "Milked at 4.30 am",
  "At your gate by 6",
  "Never pooled",
  "Never standardised",
  "One farm, one herd",
  "Morning & evening rounds",
];

function Ticker() {
  const run = TICKER.concat(TICKER);
  return (
    <div className="strip" aria-hidden="true">
      <div className="strip__track">
        {run.concat(run).map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}

/** The round, as a timeline: a lime line that fills with the scroll, and a
    photograph per step that clips open as it comes into view. */
function Morning({ steps }: { steps: { time: string; title: string; body: string }[] }) {
  const still = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: track,
    offset: ["start 0.85", "end 0.65"],
  });
  const fill = useSpring(scrollYProgress, { stiffness: 90, damping: 24, restDelta: 0.001 });

  return (
    <section className="sect steps-sect">
      <div className="shell">
        <span className="eyebrow">Half past four to six</span>
        <h2 className="h2 mt-1 mb-2">A morning at the farm</h2>

        <div className="steps" ref={track}>
          <div className="steps__rail" aria-hidden="true">
            <motion.div className="steps__fill" style={{ scaleY: still ? 1 : fill }} />
          </div>

          {steps.map((step, i) => (
            <article className="step" key={step.title}>
              <div className="step__mark">
                <motion.span
                  className="step__dot"
                  initial={still ? false : { scale: 0.4, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, margin: "-25% 0px -25% 0px" }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                />
                <span className="step__time num">{step.time.replace(/\s?[ap]m/i, "")}</span>
              </div>

              <div className="step__panel">
                <motion.figure
                  className="step__media"
                  initial={still ? false : { clipPath: "inset(0 0 100% 0)" }}
                  whileInView={{ clipPath: "inset(0 0 0% 0)" }}
                  viewport={{ once: true, margin: "-15% 0px" }}
                  transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <img {...photo(STEP_PHOTOS[i % STEP_PHOTOS.length], 720, 540, "(min-width: 900px) 540px, 80vw")} />
                  <span className="step__n num">{String(i + 1).padStart(2, "0")}</span>
                </motion.figure>

                <motion.div
                  className="step__copy"
                  initial={still ? false : { opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-15% 0px" }}
                  transition={{ duration: 0.6, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <h3 className="h3">{step.title}</h3>
                  <p className="muted sm mt-1">{step.body}</p>
                </motion.div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const SLIDE_MS = 6000;

function Hero({ content }: { content: HomeContent | null }) {
  const still = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  // Frames load as the show reaches them (plus the next, so its fade is ready):
  // stacked on screen, "lazy" alone would fetch all three at once.
  const [reached, setReached] = useState(0);
  useEffect(() => setReached((r) => Math.max(r, i)), [i]);

  useEffect(() => {
    if (still || paused) return;
    const t = setTimeout(() => setI((n) => (n + 1) % HERO_SLIDES.length), SLIDE_MS);
    return () => clearTimeout(t);
  }, [i, still, paused]);

  return (
    <>
      <section
        className="hero"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
      >
        {/* Opacity only. The slow drift is a CSS animation that never restarts,
            so nothing snaps back while a frame is still fading out. */}
        {HERO_SLIDES.map((slide, n) =>
          n <= reached + 1 ? (
            <img
              key={slide.key}
              {...heroImage(slide)}
              alt=""
              className={`hero__frame${n === i ? " hero__frame--on" : ""}`}
              loading={n === 0 ? "eager" : "lazy"}
            />
          ) : null,
        )}

        <div className="hero__body">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <span className="eyebrow">{content?.hero_eyebrow ?? "Village 11 SHPD, Suratgarh"}</span>
            <h1 className="display mt-1">{content?.hero_heading ?? "Milk that never sees a warehouse."}</h1>
            <p className="lede mt-2">
              {content?.hero_subheading ??
                "Drawn at first light from our own cows and buffaloes, and at your door before the day gets warm."}
            </p>
            <div className="inline mt-3">
              <Link to="/packages" className="btn btn--primary btn--lg">
                Start a subscription <Icon.arrow />
              </Link>
              <Link
                to="/shop"
                className="btn btn--ghost btn--lg"
                style={{ color: "#fff", "--btn-ring": "rgba(255,255,255,.4)" } as CSSProperties}
              >
                See the shop
              </Link>
            </div>
          </motion.div>

          <div className="hero__foot">
            <div className="hero__dots" role="tablist" aria-label="Hero images">
              {HERO_SLIDES.map((slide, n) => (
                <button
                  key={slide.key}
                  role="tab"
                  aria-selected={n === i}
                  aria-label={slide.caption}
                  className={`hero__dot${n === i ? " hero__dot--on" : ""}`}
                  onClick={() => setI(n)}
                >
                  {n === i && !still && (
                    <motion.i
                      key={`${i}-${paused}`}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: paused ? 0.001 : 1 }}
                      transition={{ duration: paused ? 0 : SLIDE_MS / 1000, ease: "linear" }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Ticker />
    </>
  );
}

/** Same markup as the real card with blank text, so the card that replaces it is the same height. */
function PackageCardSkeleton() {
  return (
    <div className="card railcard skel" style={{ borderTop: "3px solid transparent" }} aria-hidden="true">
      <div className="between">
        <span className="eyebrow eyebrow--bare">&nbsp;</span>
        <span className="chip" style={{ visibility: "hidden" }}>
          &nbsp;
        </span>
      </div>
      <h3 className="h3" style={{ marginTop: 2 }}>
        &nbsp;
      </h3>
      <p className="sm" style={{ flex: 1 }}>
        &nbsp;
      </p>
      <div className="inline" style={{ gap: 6, marginTop: 6 }}>
        <span className="chip" style={{ visibility: "hidden" }}>
          &nbsp;
        </span>
      </div>
      <div className="between" style={{ marginTop: "var(--sp-3)" }}>
        <b className="num" style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
          &nbsp;
        </b>
        <span className="chip chip--ok" style={{ visibility: "hidden" }}>
          &nbsp;
        </span>
      </div>
    </div>
  );
}

function ProductTileSkeleton() {
  return (
    <div className="card tilecard" aria-hidden="true">
      <div className="skel" style={{ aspectRatio: "1", borderRadius: 0 }} />
      <div style={{ padding: "var(--sp-3)" }}>
        <div style={{ fontWeight: 600, fontSize: "var(--t-sm)" }}>&nbsp;</div>
        <div className="tiny num" style={{ marginTop: 2 }}>
          &nbsp;
        </div>
      </div>
    </div>
  );
}

function PackageCard({ pkg }: { pkg: Package }) {
  return (
    <Link
      to={`/packages/${pkg.slug}`}
      className="card railcard"
      style={{ borderTop: `3px solid ${pkg.accent}` }}
    >
      <div className="between">
        <span className="eyebrow eyebrow--bare muted">{pkg.serves}</span>
        {pkg.is_featured && <span className="chip chip--brand">Most picked</span>}
      </div>
      <h3 className="h3" style={{ marginTop: 2 }}>
        {pkg.name}
      </h3>
      <p className="sm muted" style={{ flex: 1 }}>
        {pkg.tagline}
      </p>
      <div className="inline" style={{ gap: 6, marginTop: 6 }}>
        {pkg.items.slice(0, 3).map((item) => (
          <span key={item.id} className="chip">
            {item.product.name}
          </span>
        ))}
      </div>
      <div className="between" style={{ marginTop: "var(--sp-3)", flexWrap: "wrap", rowGap: 6 }}>
        <span style={{ whiteSpace: "nowrap" }}>
          <b className="num" style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
            {money(pkg.monthly_estimate)}
          </b>
          <span className="tiny muted"> /month</span>
        </span>
        {Number(pkg.discount_percent) > 0 && (
          <span className="chip chip--ok">save {Number(pkg.discount_percent)}%</span>
        )}
      </div>
    </Link>
  );
}

function ProductTile({ product }: { product: Product }) {
  return (
    <Link
      to={`/product/${product.slug}`}
      className="card tilecard"
    >
      <div
        style={{
          aspectRatio: "1",
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(165deg, color-mix(in srgb, ${product.accent} 26%, var(--surface)), var(--surface) 80%)`,
        }}
      >
        {product.image ? (
          <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ProductArt kind={product.kind} accent={product.accent} className="" />
        )}
      </div>
      <div style={{ padding: "var(--sp-3)" }}>
        <div style={{ fontWeight: 600, fontSize: "var(--t-sm)" }}>{product.name}</div>
        <div className="tiny muted num" style={{ marginTop: 2 }}>
          from {money(product.from_price)}
        </div>
      </div>
    </Link>
  );
}
