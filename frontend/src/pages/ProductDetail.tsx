import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Icon, Sheet, Skeletons, Spinner } from "../components/ui";
import { ApiError, api, type Basket as TBasket, type Frequency, type Product, type Slot, type Variant } from "../lib/api";
import { WEEKDAYS, frequencyLabel, money, richTextToParagraphs, slotLabel, slotTime } from "../lib/format";
import { toast, useAuth } from "../store/useStore";

export function ProductDetail() {
  const { slug = "" } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [missing, setMissing] = useState(false);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setProduct(null);
    setMissing(false);
    void api
      .get<Product>(`/products/${slug}/`)
      .then((p) => {
        setProduct(p);
        setVariant(p.variants[0] ?? null);
      })
      .catch(() => setMissing(true));
  }, [slug]);

  if (missing) {
    return (
      <>
        <AppBar back title="Not found" />
        <div className="shell sect center">
          <h1 className="display">Not on the round</h1>
          <p className="lede mt-1">That one may have come off the list for the season.</p>
          <Link to="/shop" className="btn btn--primary mt-3">
            Back to the shop
          </Link>
        </div>
      </>
    );
  }

  if (product && !variant) {
    return (
      <>
        <AppBar back title={product.name} />
        <div className="shell sect center">
          <h1 className="display">{product.name}</h1>
          <p className="lede mt-1">Not available right now. Check back soon, or see what else is on the round.</p>
          <Link to="/shop" className="btn btn--primary mt-3">
            Back to the shop
          </Link>
        </div>
      </>
    );
  }

  if (!product || !variant) {
    return (
      <>
        <AppBar back />
        <div className="shell pdp">
          <div className="skel pdp__media" />
          <div className="pdp__info">
            <div className="mt-3">
              <Skeletons count={2} height={30} />
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar back crumb={product.name} />

      <div className="shell pdp">
        <motion.div
          className="pdp__media"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: `linear-gradient(165deg, color-mix(in srgb, ${product.accent} 34%, var(--surface)), var(--surface) 78%)`,
          }}
        >
          {product.image_wide ? (
            <img src={product.image_wide} alt={product.name} />
          ) : (
            <ProductArt kind={product.kind} accent={product.accent} size="52%" />
          )}
        </motion.div>

        <div className="pdp__info">
          <div className="mt-3">
            <span className="eyebrow">{product.category.name}</span>
            <h1 className="display mt-1">{product.name}</h1>
            <p className="lede mt-1">{product.tagline}</p>
          </div>

          <div className="chips mt-2">
            {product.slots.map((s) => (
              <span key={s} className="chip">
                {s === "morning" ? <Icon.sun /> : <Icon.moon />}
                {slotLabel(s)} · {slotTime(s)}
              </span>
            ))}
            {product.fat_percent && <span className="chip">{product.fat_percent}% fat</span>}
            <span className="chip">Keeps {product.shelf_life.toLowerCase()}</span>
          </div>

          <div className="mt-3">
            <span className="label">Pack size</span>
            <div className="opts opts--row">
              {product.variants.map((v) => (
                <button key={v.id} className={`opt${v.id === variant.id ? " opt--on" : ""}`} onClick={() => setVariant(v)}>
                  <span className="opt__t" style={{ paddingRight: 0 }}>
                    {v.label}
                  </span>
                  <span className="opt__s num">{money(v.price)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card card--pad mt-3">
            {richTextToParagraphs(product.description).map((p, i) => (
              <p key={i} className="sm" style={{ color: "var(--ink-2)", marginTop: i ? "0.7rem" : 0 }}>
                {p}
              </p>
            ))}
          </div>

          <div className="mt-3" style={{ paddingBottom: "var(--sp-6)" }}>
            {product.is_subscribable ? (
              <button className="btn btn--primary btn--lg btn--block" onClick={() => setAdding(true)}>
                Add to my basket · {money(variant.price)}
              </button>
            ) : (
              <p className="muted center">Available as a one-off order only.</p>
            )}
          </div>
        </div>
      </div>

      <AddSheet
        open={adding}
        onClose={() => setAdding(false)}
        product={product}
        variant={variant}
      />
    </>
  );
}

/* ── Add to basket ─────────────────────────────────────────────────── */

function AddSheet({
  open,
  onClose,
  product,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  product: Product;
  variant: Variant;
}) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const baskets = useAuth((s) => s.baskets);
  const addresses = useAuth((s) => s.addresses);
  const loadBaskets = useAuth((s) => s.loadBaskets);

  const [quantity, setQuantity] = useState(1);
  const [slot, setSlot] = useState<Slot>(product.slots[0] ?? "morning");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [weekdays, setWeekdays] = useState<number[]>([0, 3]);
  const [busy, setBusy] = useState(false);

  const basket = baskets[0] ?? null;

  async function add() {
    if (!user) {
      navigate(`/login?next=/product/${product.slug}`);
      return;
    }
    if (!addresses.length) {
      navigate("/account/addresses?next=/product/" + product.slug);
      toast("Add a delivery address first.");
      return;
    }

    setBusy(true);
    try {
      let target = basket;
      if (!target) {
        target = await api.post<TBasket>("/subscriptions/", {
          address: (addresses.find((a) => a.is_default) ?? addresses[0]).id,
        });
        // Known to the store at once, so a retry after a failed line uses it
        // rather than trying to start a second basket.
        await loadBaskets();
      }
      await api.post("/basket-lines/", {
        subscription: target!.id,
        variant: variant.id,
        quantity,
        slot,
        frequency,
        weekdays: frequency === "weekdays" ? weekdays : [],
      });
      await loadBaskets();
      toast(`${product.name} added to your basket.`);
      onClose();
      navigate("/basket");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not add that.", "error");
    } finally {
      setBusy(false);
    }
  }

  const perDelivery = Number(variant.price) * quantity;
  const noDays = frequency === "weekdays" && weekdays.length === 0;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Add ${product.name}`}
      footer={
        <button className="btn btn--primary btn--lg btn--block" onClick={add} disabled={busy || noDays}>
          {busy ? <Spinner /> : null}
          {user ? `Add · ${money(perDelivery)} per delivery` : "Sign in to add"}
        </button>
      }
    >
      <div className="between mb-2">
        <div>
          <div className="row__t">{variant.label}</div>
          <div className="row__s num">{money(variant.price)} each</div>
        </div>
        <div className="stepper">
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Fewer">
            −
          </button>
          <span className="num">{quantity}</span>
          <button onClick={() => setQuantity((q) => Math.min(20, q + 1))} disabled={quantity >= 20} aria-label="More">
            +
          </button>
        </div>
      </div>

      {product.slots.length > 1 && (
        <>
          <span className="label">Round</span>
          <div className="seg mb-2">
            {product.slots.map((s) => (
              <button key={s} className={`seg__b${slot === s ? " seg__b--on" : ""}`} onClick={() => setSlot(s)}>
                {slot === s && <motion.span layoutId="add-slot" className="seg__bg" />}
                {slotLabel(s)}
              </button>
            ))}
          </div>
        </>
      )}

      <span className="label">How often</span>
      <div className="opts">
        {(["daily", "alternate", "weekdays", "monthly"] as const).map((f) => (
          <button key={f} className={`opt${frequency === f ? " opt--on" : ""}`} onClick={() => setFrequency(f)}>
            <span className="opt__t">{frequencyLabel(f, [0, 3])}</span>
            {frequency === f && (
              <span className="opt__tick">
                <Icon.tick />
              </span>
            )}
          </button>
        ))}
      </div>

      {frequency === "weekdays" && (
        <div className="mt-2">
          <span className="label">Which days</span>
          <div className="days">
            {WEEKDAYS.map((label, i) => (
              <button
                key={label}
                className={`day${weekdays.includes(i) ? " day--on" : ""}`}
                onClick={() =>
                  setWeekdays((w) => (w.includes(i) ? w.filter((d) => d !== i) : [...w, i].sort((a, b) => a - b)))
                }
                aria-pressed={weekdays.includes(i)}
              >
                {label.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="hint mt-2">
        {basket
          ? "This joins your existing basket, so it is one bill and one place to pause."
          : "This starts your basket. You can add more items any time."}
      </p>
    </Sheet>
  );
}
