import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppBar } from "../../components/Shell";
import { Icon, Skeletons, Spinner } from "../../components/ui";
import { ApiError, api, type FarmOverview, type SiteContent } from "../../lib/api";
import { htmlToParagraphs, money, paragraphsToHtml, slotLabel, stripTags } from "../../lib/format";
import { toast, useAuth } from "../../store/useStore";

/* ── Overview / "More" hub ─────────────────────────────────────────── */

export function FarmMore() {
  const staff = useAuth((s) => s.staff);
  const signOut = useAuth((s) => s.signOut);
  const navigate = useNavigate();
  const [ov, setOv] = useState<FarmOverview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.get<FarmOverview>("/farm/overview/").then(setOv).catch(() => undefined);
  }, []);

  async function rebuild() {
    setBusy(true);
    try {
      const res = await api.post<{ created: number; updated: number; removed: number }>("/farm/roster/rebuild/", {
        days: 14,
      });
      toast(`Roster rebuilt: ${res.created} added, ${res.updated} updated, ${res.removed} withdrawn.`);
    } catch {
      toast("Could not rebuild the roster.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar title="Farm desk" />
      <div className="shell">
        {ov === null ? (
          <Skeletons count={3} height={90} />
        ) : (
          <>
            <div className="tiles">
              <div className="tile">
                <div className="tile__k">Customers</div>
                <div className="tile__v num">{ov.customers.total}</div>
              </div>
              <div className="tile">
                <div className="tile__k">Active baskets</div>
                <div className="tile__v num">{ov.customers.active}</div>
              </div>
              <div className="tile">
                <div className="tile__k">Delivered this month</div>
                <div className="tile__v num">{ov.month.delivered}</div>
              </div>
              <div className="tile">
                <div className="tile__k">Taken this month</div>
                <div className="tile__v num">{money(ov.month.value)}</div>
              </div>
            </div>

            <h2 className="h3 mt-3 mb-2">To fill tomorrow</h2>
            {ov.tomorrow.length === 0 ? (
              <p className="muted sm">Nothing scheduled for tomorrow yet.</p>
            ) : (
              <div className="card card--pad">
                {ov.tomorrow.map((row, i) => (
                  <div
                    key={`${row.product}-${row.variant}-${row.slot}`}
                    className="between"
                    style={{ paddingBlock: "0.5rem", borderTop: i ? "1px solid var(--line-2)" : undefined }}
                  >
                    <span className="sm">
                      {row.product} <span className="muted">{row.variant}</span>
                    </span>
                    <span className="inline" style={{ gap: 8 }}>
                      <span className="chip">{slotLabel(row.slot)}</span>
                      <b className="num">{row.packs}</b>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {ov.low_wallets.length > 0 && (
              <>
                <h2 className="h3 mt-3 mb-2">Wallets running low</h2>
                <div className="stack flow-sm">
                  {ov.low_wallets.map((w) => (
                    <Link key={w.id} to={`/farm/customers/${w.id}`} className="row">
                      <span className="row__main">
                        <span className="row__t">{w.name}</span>
                        <span className="row__s num">{w.phone}</span>
                      </span>
                      <span className="row__end num sm" style={{ color: "var(--bad)", fontWeight: 700 }}>
                        {money(w.balance)}
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <h2 className="h3 mt-3 mb-2">Manage</h2>
        <div className="stack flow-sm">
          <Link to="/farm/website" className="row">
            <span className="row__art" style={{ background: "var(--accent-soft)" }}>
              <Icon.pencil />
            </span>
            <span className="row__main">
              <span className="row__t">Website text</span>
              <span className="row__s">Change the words on the storefront</span>
            </span>
            <span className="row__end muted">
              <Icon.chev />
            </span>
          </Link>

          <button className="row" onClick={rebuild} disabled={busy}>
            <span className="row__art" style={{ background: "var(--ok-soft)" }}>
              {busy ? <Spinner /> : <Icon.refresh />}
            </span>
            <span className="row__main">
              <span className="row__t">Rebuild the roster</span>
              <span className="row__s">Extend the delivery list another 14 days</span>
            </span>
          </button>
        </div>

        <div className="card card--pad mt-3" style={{ marginBottom: "var(--sp-8)" }}>
          <div className="between">
            <div>
              <div className="row__t">{staff?.full_name || staff?.username}</div>
              <div className="row__s">Signed in as {staff?.username}</div>
            </div>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => {
                signOut();
                navigate("/farm/login");
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Website text ──────────────────────────────────────────────────── */

const FIELDS: { key: keyof SiteContent; label: string; hint: string; long?: boolean; max?: number; required?: boolean }[] = [
  { key: "hero_eyebrow", label: "Small line above the headline", hint: "e.g. Village 11 SHPD, Suratgarh", max: 80 },
  { key: "hero_heading", label: "Big headline", hint: "The first thing anyone reads", max: 140, required: true },
  { key: "hero_subheading", label: "Under the headline", hint: "One or two sentences", long: true },
  { key: "hero_cta_label", label: "Button text", hint: "e.g. Start a subscription", max: 40 },
  { key: "story_heading", label: "Story heading", hint: "Further down the page", max: 140 },
  { key: "story_body", label: "Story text", hint: "Leave a blank line between paragraphs", long: true },
];

export function FarmWebsite() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void api
      .get<SiteContent>("/farm/content/")
      // Clean the stored text once, on the way in. Doing it on every render
      // ate each space and line break as it was typed.
      .then((c) =>
        setContent({
          ...c,
          ...Object.fromEntries(FIELDS.filter((f) => f.key !== "story_body").map((f) => [f.key, stripTags(c[f.key])])),
          story_body: htmlToParagraphs(c.story_body),
        }),
      )
      .catch(() => toast("Could not load the text.", "error"));
  }, []);

  const missing = FIELDS.find((f) => f.required && !content?.[f.key]?.trim());

  async function save() {
    if (!content) return;
    setBusy(true);
    try {

      await api.patch("/farm/content/", { ...content, story_body: paragraphsToHtml(content.story_body) });
      toast("Website updated. Customers see it straight away.");
      setDirty(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!content) {
    return (
      <>
        <AppBar back="/farm/more" title="Website text" />
        <div className="shell">
          <Skeletons count={4} height={80} />
        </div>
      </>
    );
  }

  return (
    <>
      <AppBar back="/farm/more" title="Website text" />
      <div className="shell shell--form">
        <p className="sm muted">
          These are the words on your public page. Change them here and they go live immediately.
        </p>

        <div className="mt-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span className="label">{f.label}</span>
              {f.long ? (
                <textarea
                  className="textarea"
                  rows={f.key === "story_body" ? 7 : 3}
                  value={content[f.key]}
                  onChange={(e) => {
                    setContent({ ...content, [f.key]: e.target.value });
                    setDirty(true);
                  }}
                />
              ) : (
                <input
                  className="input"
                  maxLength={f.max}
                  required={f.required}
                  value={content[f.key]}
                  onChange={(e) => {
                    setContent({ ...content, [f.key]: e.target.value });
                    setDirty(true);
                  }}
                />
              )}
              <span className="hint">{f.hint}</span>
            </label>
          ))}
        </div>

        <div className="mt-3" style={{ paddingBottom: "var(--sp-8)" }}>
          <button
            className="btn btn--primary btn--lg btn--block btn--desk-auto"
            onClick={save}
            disabled={busy || !dirty || !!missing}
          >
            {busy ? <Spinner /> : null} {dirty ? "Save and publish" : "Nothing to save"}
          </button>
          {missing && <p className="hint mt-1">{missing.label} cannot be empty.</p>}
        </div>
      </div>
    </>
  );
}
