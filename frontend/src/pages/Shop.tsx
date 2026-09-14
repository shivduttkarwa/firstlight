import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Empty, Icon, Reveal, Skeletons } from "../components/ui";
import { api, type Product } from "../lib/api";
import { money, slotLabel } from "../lib/format";
import { productPhoto } from "../lib/photos";

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

      <div className="shell pagehead">
        <div>
          <h1 className="display">Everything off one farm.</h1>
          <p className="lede mt-1">Subscribe for a daily round, or add a one-off to your basket.</p>
        </div>
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
          <div className="pgrid">
            {shown.map((p, i) => (
              <Reveal key={p.id} delay={Math.min(i, 6) * 0.04}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ProductCard({ product }: { product: Product }) {
  const localPhoto = productPhoto(product.slug);

  return (
    <Link to={`/product/${product.slug}`} className="card pcard">
      <div
        className="pcard__art"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${product.accent} 30%, var(--surface)), var(--surface) 82%)`,
        }}
      >
        {product.image || localPhoto ? (
          <img src={product.image ?? localPhoto?.src} alt="" loading="lazy" decoding="async" />
        ) : (
          <ProductArt kind={product.kind} accent={product.accent} size="62%" />
        )}
      </div>

      <div className="pcard__body">
        <div className="pcard__head">
          <h3 className="pcard__name">{product.name}</h3>
          {product.badge && <span className="chip chip--accent">{product.badge}</span>}
        </div>
        <p className="sm muted pcard__tag">{product.tagline}</p>
        <div className="pcard__foot">
          <span className="chips">
            {product.slots.map((s) => (
              <span key={s} className="chip">
                {s === "morning" ? <Icon.sun /> : <Icon.moon />}
                {slotLabel(s)}
              </span>
            ))}
          </span>
          <span className="num pcard__price">{money(product.from_price)}</span>
        </div>
      </div>
    </Link>
  );
}
