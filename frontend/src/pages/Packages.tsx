import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ProductArt } from "../components/ProductArt";
import { AppBar } from "../components/Shell";
import { Icon, Reveal, Skeletons, Spinner } from "../components/ui";
import { ApiError, api, type Package } from "../lib/api";
import { frequencyLabel, money, slotLabel } from "../lib/format";
import { toast, useAuth } from "../store/useStore";

export function Packages() {
  const [packages, setPackages] = useState<Package[] | null>(null);

  useEffect(() => {
    void api.get<Package[]>("/packages/").then(setPackages).catch(() => setPackages([]));
  }, []);

  return (
    <>
      <AppBar title="Packages" />
      <div className="shell">
        <h1 className="display">Start in two taps.</h1>
        <p className="lede mt-1">
          A ready-made basket the farm put together. Take it as it is, or change anything afterwards.
        </p>

        {packages === null ? (
          <div className="mt-3">
            <Skeletons count={3} height={190} />
          </div>
        ) : (
          <div className="pkggrid mt-3">
            {packages.map((pkg, i) => (
              <Reveal key={pkg.id} delay={i * 0.06}>
                <PackageBlock pkg={pkg} />
              </Reveal>
            ))}
          </div>
        )}

        <div className="card card--pad mt-3 buildown" style={{ marginBottom: "var(--sp-8)" }}>
          <div>
            <h2 className="h3">Rather build your own?</h2>
            <p className="sm muted mt-1">Pick items one by one and set the rhythm for each.</p>
          </div>
          <Link to="/shop" className="btn btn--soft mt-2">
            Browse the shop <Icon.arrow />
          </Link>
        </div>
      </div>
    </>
  );
}

function PackageBlock({ pkg }: { pkg: Package }) {
  return (
    <Link to={`/packages/${pkg.slug}`} className="card pkgcard">
      <div style={{ height: 4, background: pkg.accent }} />
      <div className="pkgcard__body">
        <div className="between">
          <span className="eyebrow eyebrow--bare muted">{pkg.serves}</span>
          {pkg.is_featured && <span className="chip chip--brand">Most picked</span>}
        </div>
        <h2 className="h2 mt-1">{pkg.name}</h2>
        <p className="sm muted mt-1">{pkg.tagline}</p>

        <div className="stack flow-sm mt-2">
          {pkg.items.map((item) => (
            <div key={item.id} className="inline" style={{ flexWrap: "nowrap", gap: "var(--sp-3)" }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: "var(--r-xs)",
                  display: "grid",
                  placeItems: "center",
                  background: `color-mix(in srgb, ${item.product.accent} 24%, var(--surface))`,
                }}
              >
                <ProductArt kind={item.product.kind} accent={item.product.accent} size="66%" />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="sm" style={{ fontWeight: 600 }}>
                  {item.quantity} × {item.product.name} {item.product.variant_label}
                </span>
                <span className="tiny muted" style={{ display: "block" }}>
                  {frequencyLabel(item.frequency, item.weekdays)} · {slotLabel(item.slot)}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="between mt-3 pkgcard__foot">
          <span>
            <b className="num" style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-lg)" }}>
              {money(pkg.monthly_estimate)}
            </b>
            <span className="tiny muted"> /month</span>
          </span>
          <span className="inline" style={{ gap: 8 }}>
            {Number(pkg.discount_percent) > 0 && (
              <span className="chip chip--ok">save {Number(pkg.discount_percent)}%</span>
            )}
            <span className="btn btn--soft btn--sm">Choose</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export function PackageDetail() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const addresses = useAuth((s) => s.addresses);
  const baskets = useAuth((s) => s.baskets);
  const loadBaskets = useAuth((s) => s.loadBaskets);
  const current = baskets[0] ?? null;

  const [pkg, setPkg] = useState<Package | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.get<Package>(`/packages/${slug}/`).then(setPkg).catch(() => navigate("/packages"));
  }, [slug, navigate]);

  useEffect(() => {
    if (addresses.length && addressId === null) {
      setAddressId((addresses.find((a) => a.is_default) ?? addresses[0]).id);
    }
  }, [addresses, addressId]);

  if (!pkg) {
    return (
      <>
        <AppBar back />
        <div className="shell">
          <Skeletons count={3} height={80} />
        </div>
      </>
    );
  }

  async function start() {
    if (!user) {
      navigate(`/login?next=/packages/${slug}`);
      return;
    }
    if (!addressId) {
      navigate(`/account/addresses?next=/packages/${slug}`);
      toast("Add a delivery address first.");
      return;
    }
    // One basket per household: starting a package replaces the one you have.
    if (
      current &&
      !confirm(
        `This replaces your current basket (${current.item_count} item${current.item_count === 1 ? "" : "s"}) ` +
          `with ${pkg!.name}. Anything already packed still arrives. Continue?`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.post("/subscriptions/from-package/", {
        package: pkg!.slug,
        address: addressId,
        replace: !!current,
      });
      await loadBaskets();
      toast(`${pkg!.name} is on the round.`);
      navigate("/basket");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await loadBaskets();
      toast(e instanceof ApiError ? e.message : "Could not start that package.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar back title={pkg.name} />
      <div className="shell split">
        <div className="split__main">
          <div className="card card--pad" style={{ borderTop: `4px solid ${pkg.accent}` }}>
            <span className="eyebrow eyebrow--bare muted">{pkg.serves}</span>
            <h1 className="display mt-1">{pkg.name}</h1>
            <p className="lede mt-1">{pkg.tagline}</p>
            <div className="between mt-3">
              <span>
                <b className="num" style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-xl)" }}>
                  {money(pkg.monthly_estimate)}
                </b>
                <span className="tiny muted"> /month, about</span>
              </span>
              {Number(pkg.discount_percent) > 0 && (
                <span className="chip chip--ok">save {Number(pkg.discount_percent)}%</span>
              )}
            </div>
          </div>

          <h2 className="h3 mt-3 mb-2">What comes</h2>
          <div className="stack flow-sm">
            {pkg.items.map((item) => (
              <div key={item.id} className="row" style={{ ["--accent" as string]: item.product.accent }}>
                <span className="row__art">
                  <ProductArt kind={item.product.kind} accent={item.product.accent} size="70%" />
                </span>
                <span className="row__main">
                  <span className="row__t">
                    {item.quantity} × {item.product.name}
                  </span>
                  <span className="row__s">
                    {item.product.variant_label} · {frequencyLabel(item.frequency, item.weekdays)} ·{" "}
                    {slotLabel(item.slot)}
                  </span>
                </span>
                <span className="row__end num sm muted">{money(item.product.unit_price)}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="split__aside asidecard">
          <div className="desk-only">
            <span className="eyebrow eyebrow--bare muted">Your package</span>
            <div className="between mt-1">
              <b className="h3">{pkg.name}</b>
              {Number(pkg.discount_percent) > 0 && (
                <span className="chip chip--ok">save {Number(pkg.discount_percent)}%</span>
              )}
            </div>
            <p className="mt-1">
              <b className="num" style={{ fontFamily: "var(--font-display)", fontSize: "var(--t-xl)" }}>
                {money(pkg.monthly_estimate)}
              </b>
              <span className="tiny muted"> /month, about</span>
            </p>
            <hr className="rule" />
          </div>

          {user && addresses.length > 1 && (
            <div className="mt-3">
              <span className="label">Deliver to</span>
              <div className="opts">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    className={`opt${a.id === addressId ? " opt--on" : ""}`}
                    onClick={() => setAddressId(a.id)}
                  >
                    <span className="opt__t" style={{ textTransform: "capitalize" }}>
                      {a.label}
                    </span>
                    <span className="opt__s">
                      {a.line1}, {a.village}
                    </span>
                    {a.id === addressId && (
                      <span className="opt__tick">
                        <Icon.tick />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
            <button className="btn btn--primary btn--lg btn--block" onClick={start} disabled={busy}>
              {busy ? <Spinner /> : null}
              {!user ? "Sign in to start" : current ? "Switch to this package" : "Start this package"}
            </button>
            <p className="hint center mt-1">Change any item, skip any day, pause whenever. No lock-in.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
