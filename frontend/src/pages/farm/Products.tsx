import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ProductArt } from "../../components/ProductArt";
import { AppBar } from "../../components/Shell";
import { Icon, Sheet, Skeletons, Spinner } from "../../components/ui";
import { ApiError, api, type StaffProduct, type StaffVariant } from "../../lib/api";
import { kindLabel, money } from "../../lib/format";
import { productPhoto } from "../../lib/photos";
import { toast } from "../../store/useStore";

export function FarmProducts() {
  const [products, setProducts] = useState<StaffProduct[] | null>(null);
  const [editing, setEditing] = useState<{ product: StaffProduct; variant: StaffVariant } | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await api.get<StaffProduct[]>("/farm/products/"));
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePrice() {
    setBusy(true);
    try {
      const res = await api.post<{ detail: string }>("/farm/products/set-price/", {
        variant: editing!.variant.id,
        price,
      });
      toast(res.detail);
      setEditing(null);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not change the price.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(product: StaffProduct) {
    try {
      const res = await api.post<{ is_active: boolean; detail: string }>(`/farm/products/${product.slug}/toggle/`);
      toast(res.detail);
      await load();
    } catch {
      toast("Could not update.", "error");
    }
  }

  return (
    <>
      <AppBar title="Products & prices" />
      <div className="shell">
        <div className="between" style={{ flexWrap: "wrap", gap: "var(--sp-3)" }}>
          <p className="sm muted measure">
            Tap a pack size to change its price. Baskets that already have it keep their price; new ones pay the new one.
          </p>
          <Link to="/farm/products/new" className="btn btn--primary btn--sm">
            <Icon.plus /> Add product
          </Link>
        </div>

        <div className="mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
          {products === null ? (
            <Skeletons count={4} height={140} />
          ) : (
            <div className="stack flow-sm farmgrid">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onToggle={() => void toggle(p)}
                  onPrice={(variant) => {
                    setEditing({ product: p, variant });
                    setPrice(variant.price);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.product.name} · ${editing.variant.label}` : ""}
        footer={
          <button className="btn btn--primary btn--lg btn--block" onClick={savePrice} disabled={busy || !/^\d+(\.\d{1,2})?$/.test(price) || Number(price) < 1}>
            {busy ? <Spinner /> : null} Set price to {money(price || 0)}
          </button>
        }
      >
        <div className="field">
          <span className="label">New price</span>
          <input
            className="input num"
            style={{ fontSize: "1.5rem", fontFamily: "var(--font-display)" }}
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            autoFocus
          />
        </div>
        <p className="hint">
          This is what new basket items will cost. Items already in a basket keep their price, unless the customer
          switches them to a different pack size.
        </p>
      </Sheet>
    </>
  );
}

function ProductCard({
  product: p,
  onPrice,
  onToggle,
}: {
  product: StaffProduct;
  onPrice: (variant: StaffVariant) => void;
  onToggle: () => void;
}) {
  const builtIn = p.image ? null : productPhoto(p.slug);

  return (
    <div className="card card--pad" style={{ opacity: p.is_active ? 1 : 0.7 }}>
      <div className="inline" style={{ flexWrap: "nowrap", gap: "var(--sp-3)" }}>
        <span
          className="row__art"
          style={{ background: `color-mix(in srgb, ${p.accent} 26%, var(--surface))`, overflow: "hidden" }}
        >
          {p.image || builtIn ? (
            <img
              src={p.image ?? builtIn?.src}
              srcSet={builtIn?.srcSet}
              sizes="56px"
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <ProductArt kind={p.kind} accent={p.accent} size="70%" />
          )}
        </span>
        <span className="row__main" style={{ minWidth: 0 }}>
          <span className="row__t">
            {p.name}
            {!p.is_active && (
              <span className="tag tag--paused" style={{ marginLeft: 8 }}>
                Hidden
              </span>
            )}
          </span>
          <span className="row__s" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {kindLabel(p.kind)}
            {p.tagline ? ` · ${p.tagline}` : ""}
          </span>
        </span>
        <Link to={`/farm/products/${p.slug}`} className="btn btn--soft btn--sm">
          Edit
        </Link>
        <button className="btn btn--ghost btn--sm" onClick={onToggle}>
          {p.is_active ? "Hide" : "Show"}
        </button>
      </div>

      <div className="stack flow-sm mt-3">
        {p.variants.map((v) => (
          <button
            key={v.id}
            className="between"
            style={{
              width: "100%",
              padding: "0.6rem 0.75rem",
              borderRadius: "var(--r-sm)",
              background: "var(--line-2)",
              opacity: v.is_active ? 1 : 0.6,
            }}
            onClick={() => onPrice(v)}
          >
            <span className="sm">
              {v.label}
              {!v.is_active && (
                <span className="tag tag--paused" style={{ marginLeft: 8 }}>
                  Hidden
                </span>
              )}
            </span>
            <span className="inline" style={{ gap: 8 }}>
              <b className="num">{money(v.price)}</b>
              <span style={{ width: 16, height: 16, color: "var(--ink-3)" }}>
                <Icon.pencil />
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
