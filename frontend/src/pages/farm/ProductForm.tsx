import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProductArt } from "../../components/ProductArt";
import { AppBar } from "../../components/Shell";
import { Icon, Skeletons, Spinner } from "../../components/ui";
import { ApiError, api, type ProductPayload, type StaffProduct } from "../../lib/api";
import { htmlToParagraphs, kindLabel, paragraphsToHtml, slotLabel, slotTime } from "../../lib/format";
import { productPhoto } from "../../lib/photos";
import { toast } from "../../store/useStore";

const ANIMALS: [StaffProduct["animal"], string][] = [
  ["cow", "Cow"],
  ["buffalo", "Buffalo"],
  ["mixed", "Both"],
  ["none", "Neither"],
];

const COLOURS = ["#C6F24B", "#2F6BF0", "#0E6B4B", "#7EC4A8", "#B9CCC2", "#17B3A0", "#E8A33D", "#D9644A"];
const PRICE = /^\d{1,6}(\.\d{1,2})?$/;
const PERCENT = /^(100|\d{1,2}(\.\d)?)$/;

interface PackDraft {
  key: number;
  id?: number;
  label: string;
  price: string;
  was: string;
  shown: boolean;
  inUse: boolean;
}

interface Draft {
  name: string;
  kind: string;
  animal: StaffProduct["animal"];
  tagline: string;
  description: string;
  badge: string;
  fat: string;
  snf: string;
  keeps: string;
  accent: string;
  morning: boolean;
  evening: boolean;
  shown: boolean;
  packs: PackDraft[];
}

let nextKey = 1;
const newPack = (): PackDraft => ({ key: nextKey++, label: "", price: "", was: "", shown: true, inUse: false });
const plainPrice = (value: string | null) => (value ? String(Number(value)) : "");
const decimal = (value: string) => value.replace(/[^\d.]/g, "");

function blankDraft(products: StaffProduct[]): Draft {
  const taken = new Set(products.map((p) => p.accent.toLowerCase()));
  return {
    name: "",
    kind: "",
    animal: "cow",
    tagline: "",
    description: "",
    badge: "",
    fat: "",
    snf: "",
    keeps: "Same day",
    accent: COLOURS.find((c) => !taken.has(c.toLowerCase())) ?? COLOURS[0],
    morning: true,
    evening: true,
    shown: true,
    packs: [newPack()],
  };
}

function draftOf(p: StaffProduct): Draft {
  return {
    name: p.name,
    kind: p.kind,
    animal: p.animal,
    tagline: p.tagline,
    description: htmlToParagraphs(p.description),
    badge: p.badge,
    fat: p.fat_percent ?? "",
    snf: p.snf_percent ?? "",
    keeps: p.shelf_life,
    accent: p.accent,
    morning: p.available_morning,
    evening: p.available_evening,
    shown: p.is_active,
    packs: p.variants.map((v) => ({
      key: nextKey++,
      id: v.id,
      label: v.label,
      price: plainPrice(v.price),
      was: plainPrice(v.compare_at_price),
      shown: v.is_active,
      inUse: v.in_use,
    })),
  };
}

function problemWith(d: Draft): string | null {
  if (!d.name.trim()) return "Give the product a name.";
  if (!d.kind.trim()) return "Choose a type, or add a new one.";
  for (const [i, pack] of d.packs.entries()) {
    const which = `Pack size ${i + 1}`;
    if (!pack.label.trim()) return `${which} needs a name, e.g. 500 g.`;
    if (!PRICE.test(pack.price) || Number(pack.price) < 1) return `${which} needs a price of at least ₹1.`;
    if (pack.was && (!PRICE.test(pack.was) || Number(pack.was) <= Number(pack.price))) {
      return `${which}: the old price has to be more than the price.`;
    }
  }
  if (!d.packs.some((p) => p.shown)) return "Keep at least one pack size in the shop.";
  if (!d.morning && !d.evening) return "Pick the morning round, the evening round or both.";
  if (d.fat && !PERCENT.test(d.fat)) return "Fat should be a number like 4.5.";
  if (d.snf && !PERCENT.test(d.snf)) return "SNF should be a number like 8.5.";
  return null;
}

function payloadOf(d: Draft): ProductPayload {
  return {
    name: d.name.trim(),
    kind: d.kind.trim(),
    animal: d.animal,
    tagline: d.tagline.trim(),
    description: paragraphsToHtml(d.description),
    badge: d.badge.trim(),
    fat_percent: d.fat || null,
    snf_percent: d.snf || null,
    shelf_life: d.keeps.trim(),
    accent: d.accent,
    available_morning: d.morning,
    available_evening: d.evening,
    is_active: d.shown,
    variants: d.packs.map((p) => ({
      id: p.id,
      label: p.label.trim(),
      price: p.price,
      compare_at_price: p.was || null,
      is_active: p.shown,
    })),
  };
}

async function shrinkPhoto(file: File, longest = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function FarmProductForm() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState<StaffProduct[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newType, setNewType] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dropPhoto, setDropPhoto] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(null);
    setPhoto(null);
    setDropPhoto(false);
    setTried(false);
    void api
      .get<StaffProduct[]>("/farm/products/")
      .then((list) => {
        const current = slug ? list.find((p) => p.slug === slug) : undefined;
        if (slug && !current) {
          toast("That product isn't there any more.", "error");
          navigate("/farm/products", { replace: true });
          return;
        }
        setProducts(list);
        setNewType(false);
        setDraft(current ? draftOf(current) : blankDraft(list));
      })
      .catch(() => toast("Could not load the products.", "error"));
  }, [slug, navigate]);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const types = useMemo(() => [...new Set((products ?? []).map((p) => p.kind))], [products]);
  const product = slug ? (products?.find((p) => p.slug === slug) ?? null) : null;

  if (!draft) {
    return (
      <>
        <AppBar back="/farm/products" title={slug ? "Edit product" : "Add a product"} />
        <div className="shell shell--form">
          <Skeletons count={4} height={120} />
        </div>
      </>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setPack = (key: number, patch: Partial<PackDraft>) =>
    setDraft((d) => (d ? { ...d, packs: d.packs.map((p) => (p.key === key ? { ...p, ...patch } : p)) } : d));
  const problem = problemWith(draft);

  const uploaded = product?.image && !dropPhoto ? product.image : null;
  const builtIn = product && (!product.image || dropPhoto) ? productPhoto(product.slug) : null;
  const shownPhoto = preview ?? uploaded ?? builtIn?.src ?? null;
  const photoHint = preview
    ? "New photo. It goes up when you save."
    : uploaded
      ? "A square photo on a plain background looks best."
      : builtIn
        ? "This is the built-in photo. Add one of your own to replace it."
        : "No photo yet. The shop shows a drawing until you add one.";

  async function save() {
    if (!draft) return;
    if (problem) {
      setTried(true);
      toast(problem, "error");
      return;
    }
    setBusy(true);
    let saved: StaffProduct;
    try {
      saved = product
        ? await api.put<StaffProduct>(`/farm/products/${product.slug}/`, payloadOf(draft))
        : await api.post<StaffProduct>("/farm/products/", payloadOf(draft));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save the product.", "error");
      setBusy(false);
      return;
    }
    try {
      if (photo) {
        const form = new FormData();
        form.append("photo", await shrinkPhoto(photo), `${saved.slug}.jpg`);
        await api.upload(`/farm/products/${saved.slug}/photo/`, form);
      } else if (dropPhoto && product?.image) {
        await api.del(`/farm/products/${saved.slug}/photo/`);
      }
    } catch (e) {
      setBusy(false);
      toast(`${saved.name} is saved, but the photo didn't go up. ${e instanceof ApiError ? e.message : "Try again."}`, "error");
      navigate(`/farm/products/${saved.slug}`, { replace: true });
      return;
    }
    setBusy(false);
    toast(saved.is_active ? `${saved.name} is saved and in the shop.` : `${saved.name} is saved and hidden from the shop.`);
    navigate("/farm/products");
  }

  return (
    <>
      <AppBar back="/farm/products" title={product ? `Edit ${product.name}` : "Add a product"} />
      <div className="shell shell--form pform">
        <section className="card card--pad">
          <h2 className="h3">Photo</h2>
          <div
            className="pform__photo mt-2"
            style={{
              background: `linear-gradient(160deg, color-mix(in srgb, ${draft.accent} 30%, var(--surface)), var(--surface) 82%)`,
            }}
          >
            {shownPhoto ? (
              <img
                src={shownPhoto}
                srcSet={builtIn && shownPhoto === builtIn.src ? builtIn.srcSet : undefined}
                sizes="(min-width: 900px) 700px, 92vw"
                alt=""
              />
            ) : (
              <ProductArt kind={draft.kind.trim().toLowerCase()} accent={draft.accent} size="26%" />
            )}
          </div>
          <div className="inline mt-2">
            <label className="btn btn--soft btn--sm pform__file">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setPhoto(file);
                  setDropPhoto(false);
                }}
              />
              {shownPhoto ? "Change photo" : "Add a photo"}
            </label>
            {(preview || uploaded) && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setPhoto(null);
                  if (product?.image) setDropPhoto(true);
                }}
              >
                Remove photo
              </button>
            )}
          </div>
          <p className="hint">{photoHint}</p>
        </section>

        <section className="card card--pad mt-2">
          <h2 className="h3">About it</h2>
          <label className="field mt-2">
            <span className="label">Name</span>
            <input
              className="input"
              value={draft.name}
              maxLength={120}
              placeholder="e.g. Fresh Paneer"
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>

          <div className="field">
            <span className="label">Type</span>
            <div className="filterrail filterrail--wrap">
              {types.map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={!newType && draft.kind === t}
                  onClick={() => {
                    setNewType(false);
                    set({ kind: t });
                  }}
                >
                  {kindLabel(t)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={newType}
                onClick={() => {
                  setNewType(true);
                  set({ kind: "" });
                }}
              >
                + New type
              </button>
            </div>
            {newType && (
              <input
                className="input mt-1"
                value={draft.kind}
                maxLength={30}
                placeholder="e.g. Paneer, Butter, Lassi"
                autoFocus
                onChange={(e) => set({ kind: e.target.value })}
              />
            )}
            <span className="hint">Each type gets its own filter in the shop.</span>
          </div>

          <div className="field">
            <span className="label">From</span>
            <div className="seg">
              {ANIMALS.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`seg__b${draft.animal === value ? " seg__b--on" : ""}`}
                  aria-pressed={draft.animal === value}
                  onClick={() => set({ animal: value })}
                >
                  {draft.animal === value && <span className="seg__bg" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="label">Short line</span>
            <input
              className="input"
              value={draft.tagline}
              maxLength={160}
              placeholder="e.g. Pressed fresh every morning"
              onChange={(e) => set({ tagline: e.target.value })}
            />
            <span className="hint">Shown under the name in the shop.</span>
          </label>

          <label className="field">
            <span className="label">Description</span>
            <textarea
              className="textarea"
              rows={5}
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
            />
            <span className="hint">Leave a blank line between paragraphs.</span>
          </label>

          <label className="field">
            <span className="label">Badge (optional)</span>
            <input
              className="input"
              value={draft.badge}
              maxLength={30}
              placeholder="e.g. New, Farm favourite"
              onChange={(e) => set({ badge: e.target.value })}
            />
          </label>
        </section>

        <section className="card card--pad mt-2">
          <h2 className="h3">Pack sizes and prices</h2>
          <p className="hint">A new price is for new basket items. Customers who already have a pack keep their price.</p>
          <div className="stack flow-sm mt-2">
            {draft.packs.map((pack) => (
              <div key={pack.key} className={`pack${pack.shown ? "" : " pack--off"}`}>
                <label className="pack__size">
                  <span className="label">Size</span>
                  <input
                    className="input"
                    value={pack.label}
                    maxLength={40}
                    readOnly={pack.inUse}
                    placeholder="e.g. 500 g"
                    onChange={(e) => setPack(pack.key, { label: e.target.value })}
                  />
                </label>
                <label>
                  <span className="label">Price ₹</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    value={pack.price}
                    placeholder="0"
                    onChange={(e) => setPack(pack.key, { price: decimal(e.target.value) })}
                  />
                </label>
                <label>
                  <span className="label">Old price ₹</span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    value={pack.was}
                    placeholder="Optional"
                    onChange={(e) => setPack(pack.key, { was: decimal(e.target.value) })}
                  />
                </label>
                <div className="pack__end">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setPack(pack.key, { shown: !pack.shown })}
                  >
                    {pack.shown ? "Hide" : "Show"}
                  </button>
                  {!pack.inUse && (
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Remove ${pack.label || "this pack size"}`}
                      disabled={draft.packs.length === 1}
                      onClick={() => set({ packs: draft.packs.filter((p) => p.key !== pack.key) })}
                    >
                      <Icon.close />
                    </button>
                  )}
                </div>
                {pack.inUse && (
                  <p className="hint pack__note">Already ordered, so the size name stays. Hide it to stop new orders.</p>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--soft btn--sm mt-2"
            onClick={() => set({ packs: [...draft.packs, newPack()] })}
          >
            <Icon.plus /> Add a pack size
          </button>
        </section>

        <section className="card card--pad mt-2">
          <h2 className="h3">Details</h2>
          <div className="field mt-2">
            <span className="label">Rounds</span>
            <div className="opts opts--row">
              {(["morning", "evening"] as const).map((slot) => {
                const on = slot === "morning" ? draft.morning : draft.evening;
                return (
                  <button
                    type="button"
                    key={slot}
                    className={`opt${on ? " opt--on" : ""}`}
                    aria-pressed={on}
                    onClick={() => set(slot === "morning" ? { morning: !on } : { evening: !on })}
                  >
                    <span className="opt__t">{slotLabel(slot)}</span>
                    <span className="opt__s">{slotTime(slot)}</span>
                    {on && (
                      <span className="opt__tick">
                        <Icon.tick />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid2 field">
            <label>
              <span className="label">Fat % (optional)</span>
              <input
                className="input num"
                inputMode="decimal"
                value={draft.fat}
                placeholder="e.g. 6.5"
                onChange={(e) => set({ fat: decimal(e.target.value) })}
              />
            </label>
            <label>
              <span className="label">SNF % (optional)</span>
              <input
                className="input num"
                inputMode="decimal"
                value={draft.snf}
                placeholder="e.g. 9.0"
                onChange={(e) => set({ snf: decimal(e.target.value) })}
              />
            </label>
          </div>

          <label className="field">
            <span className="label">Keeps</span>
            <input
              className="input"
              value={draft.keeps}
              maxLength={80}
              placeholder="e.g. Same day, 2 days chilled"
              onChange={(e) => set({ keeps: e.target.value })}
            />
          </label>

          <div className="field">
            <span className="label">Card colour</span>
            <div className="swatches">
              {COLOURS.map((colour) => (
                <button
                  type="button"
                  key={colour}
                  className="swatch"
                  style={{ background: colour }}
                  aria-label={`Colour ${colour}`}
                  aria-pressed={draft.accent.toLowerCase() === colour.toLowerCase()}
                  onClick={() => set({ accent: colour })}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="card card--pad mt-2">
          <button
            type="button"
            className={`opt${draft.shown ? " opt--on" : ""}`}
            aria-pressed={draft.shown}
            onClick={() => set({ shown: !draft.shown })}
          >
            <span className="opt__t">Show in the shop</span>
            <span className="opt__s">
              {draft.shown
                ? "Customers can see it and add it to their basket."
                : "Hidden. Baskets that already have it still receive it."}
            </span>
            {draft.shown && (
              <span className="opt__tick">
                <Icon.tick />
              </span>
            )}
          </button>
        </section>

        <div className="pform__actions">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : null} {product ? "Save changes" : "Add product"}
          </button>
          <Link to="/farm/products" className="btn btn--ghost btn--lg">
            Cancel
          </Link>
          {tried && problem && <p className="hint">{problem}</p>}
        </div>
      </div>
    </>
  );
}
