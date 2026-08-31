import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Empty, Icon, Reveal, Skeletons } from "../components/ui";
import { api, type Product } from "../lib/api";
import { money, slotLabel } from "../lib/format";

const FILTERS = [
  { key: "all", label: "Everything" },
  { key: "milk", label: "Milk" },
  { key: "ghee", label: "Ghee" },
  { key: "curd", label: "Curd" },
  { key: "chhach", label: "Chhach" },
];

export function Shop() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [params, setParams] = useSearchParams();
  const active = params.get("kind") ?? "all";

  useEffect(() => {
    void api.get<Product[]>("/products/").then(setProducts).catch(() => setProducts([]));
  }, []);

  const shown = useMemo(
    () => (active === "all" ? products : products?.filter((p) => p.kind === active)) ?? null,
    [products, active],
  );

  return (
    <>
      <AppBar title="Shop" />

      <div className="shell">
        <h1 className="display">Everything off one farm.</h1>
        <p className="lede mt-1">Subscribe for a daily round, or add a one-off to your basket.</p>
      </div>

      <div className="shell mt-3">
        <div className="filterrail">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              aria-pressed={f.key === active}
              onClick={() => setParams(f.key === "all" ? {} : { kind: f.key }, { replace: true })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="shell mt-3">
        {shown === null ? (
          <Skeletons count={4} height={104} />
        ) : shown.length === 0 ? (
          <Empty title="Nothing here" body="We are not delivering this one at the moment." />
        ) : (
          <div className="stack flow-sm">
            {shown.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 6) * 0.04}>
                <ProductRow product={p} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ProductRow({ product }: { product: Product }) {
  return (
    <Link
      to={`/product/${product.slug}`}
      className="card"
      style={{ display: "flex", gap: "var(--sp-4)", padding: "var(--sp-3)", alignItems: "center" }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          flex: "none",
          borderRadius: "var(--r-md)",
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(160deg, color-mix(in srgb, ${product.accent} 30%, var(--surface)), var(--surface) 82%)`,
          overflow: "hidden",
        }}
      >
        {product.image ? (
          <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <ProductArt kind={product.kind} accent={product.accent} size="62%" />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="between" style={{ alignItems: "flex-start" }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-md)" }}>{product.name}</h3>
          {product.badge && <span className="chip chip--accent">{product.badge}</span>}
        </div>
        <p className="sm muted" style={{ marginTop: 2 }}>
          {product.tagline}
        </p>
        <div className="between mt-1">
          <span className="chips">
            {product.slots.map((s) => (
              <span key={s} className="chip">
                {s === "morning" ? <Icon.sun /> : <Icon.moon />}
                {slotLabel(s)}
              </span>
            ))}
          </span>
          <span className="num" style={{ fontWeight: 700 }}>
            {money(product.from_price)}
          </span>
        </div>
      </div>
    </Link>
  );
}
