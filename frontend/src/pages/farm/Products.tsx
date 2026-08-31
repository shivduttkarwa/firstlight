import { useCallback, useEffect, useState } from "react";
import { ProductArt } from "../../components/ProductArt";
import { AppBar } from "../../components/Shell";
import { Icon, Sheet, Skeletons, Spinner } from "../../components/ui";
import { ApiError, api, type Product, type Variant } from "../../lib/api";
import { money } from "../../lib/format";
import { toast } from "../../store/useStore";

export function FarmProducts() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<{ product: Product; variant: Variant } | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await api.get<Product[]>("/farm/products/"));
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

  async function toggle(product: Product) {
    try {
      const res = await api.post<{ is_active: boolean }>(`/farm/products/${product.slug}/toggle/`);
      toast(res.is_active ? `${product.name} is back on sale.` : `${product.name} is hidden from the shop.`);
      await load();
    } catch {
      toast("Could not update.", "error");
    }
  }

  return (
    <>
      <AppBar title="Products & prices" />
      <div className="shell">
        <p className="sm muted">
          Tap a pack size to change its price. Customers who already subscribed keep the price they signed up at.
        </p>

        <div className="mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
          {products === null ? (
            <Skeletons count={4} height={140} />
          ) : (
            <div className="stack flow-sm">
              {products.map((p) => (
                <div key={p.id} className="card card--pad" style={{ opacity: p.is_subscribable ? 1 : 0.7 }}>
                  <div className="inline" style={{ flexWrap: "nowrap", gap: "var(--sp-3)" }}>
                    <span
                      className="row__art"
                      style={{ background: `color-mix(in srgb, ${p.accent} 26%, var(--surface))` }}
                    >
                      <ProductArt kind={p.kind} accent={p.accent} size="70%" />
                    </span>
                    <span className="row__main">
                      <span className="row__t">{p.name}</span>
                      <span className="row__s">{p.tagline}</span>
                    </span>
                    <button className="btn btn--ghost btn--sm" onClick={() => void toggle(p)}>
                      Hide
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
                        }}
                        onClick={() => {
                          setEditing({ product: p, variant: v });
                          setPrice(v.price);
                        }}
                      >
                        <span className="sm">{v.label}</span>
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
          <button className="btn btn--primary btn--lg btn--block" onClick={savePrice} disabled={busy || !Number(price)}>
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
          This is what new customers will pay. Anyone already subscribed keeps their old price until they change
          their basket.
        </p>
      </Sheet>
    </>
  );
}
