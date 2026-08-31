import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppBar } from "../components/Shell";
import { Icon, Reveal } from "../components/ui";
import { api, type FarmInfo } from "../lib/api";
import { photo } from "../lib/photos";

const HERD = [
  {
    name: "Desi cows",
    detail: "Sahiwal and Rathi, suited to the Rajasthan heat. Their milk is lighter and sweeter.",
    accent: "var(--accent)",
  },
  {
    name: "Murrah buffaloes",
    detail: "Heavier, richer milk with the fat that makes real malai and proper paneer.",
    accent: "var(--brand)",
  },
  {
    name: "Open sheds",
    detail: "Shade, fans and space to lie down. No tethering for hours on end.",
    accent: "var(--info)",
  },
  {
    name: "Our own fodder",
    detail: "Green fodder grown on the same land, so we know exactly what they eat.",
    accent: "var(--ok)",
  },
];

export function TheFarm() {
  const [info, setInfo] = useState<FarmInfo | null>(null);

  useEffect(() => {
    void api.get<FarmInfo>("/farm-info/").then(setInfo).catch(() => setInfo(null));
  }, []);

  const lines = info?.address_lines ?? [
    "Village 11 SHPD, Post 8 SHPD",
    "Tehsil Suratgarh, District Sriganganagar",
    "Rajasthan, India",
  ];

  return (
    <>
      <AppBar back title="The farm" />
      <div className="shell">
        <Reveal>
          <span className="eyebrow">Where it comes from</span>
          <h1 className="display mt-1">
            A single shed in <span className="ital">Sriganganagar</span>.
          </h1>
          <p className="lede mt-2">
            Firstlight is not a collection network. Everything we sell comes off one piece of land, from animals we
            look after ourselves.
          </p>
          <div className="figure mt-3" style={{ aspectRatio: "3 / 2" }}>
            <img {...photo("cow", 900, 600)} />
            <div className="figure__over">
              <span className="eyebrow">The herd, before the heat comes up</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="card card--pad mt-3">
            <span className="eyebrow">Find us</span>
            <address
              style={{
                fontStyle: "normal",
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-md)",
                lineHeight: 1.6,
                marginTop: "var(--sp-3)",
              }}
            >
              {lines.map((line) => (
                <span key={line} style={{ display: "block" }}>
                  {line}
                </span>
              ))}
            </address>
            <hr className="rule" />
            <div className="stack flow-sm">
              <div className="between">
                <span className="inline" style={{ gap: 8 }}>
                  <Icon.sun /> Morning round
                </span>
                <span className="muted sm">5.30 – 8.00 am</span>
              </div>
              <div className="between">
                <span className="inline" style={{ gap: 8 }}>
                  <Icon.moon /> Evening round
                </span>
                <span className="muted sm">5.00 – 7.30 pm</span>
              </div>
            </div>
          </div>
        </Reveal>

        <h2 className="h3 mt-3 mb-2">The herd</h2>
        <div className="stack flow-sm">
          {HERD.map((item, i) => (
            <Reveal key={item.name} delay={i * 0.05}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    marginTop: 7,
                    borderRadius: 2,
                    background: item.accent,
                    flex: "none",
                  }}
                />
                <span className="row__main">
                  <span className="row__t">{item.name}</span>
                  <span className="row__s" style={{ whiteSpace: "normal" }}>
                    {item.detail}
                  </span>
                </span>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <div
            className="card card--pad mt-3"
            style={{ background: "var(--panel)", color: "var(--on-panel)", marginBottom: "var(--sp-8)" }}
          >
            <h2 className="h3">Ninety minutes, gate to gate.</h2>
            <p className="sm mt-2" style={{ color: "var(--on-panel-dim)" }}>
              The morning milking starts at half past four. By half past five the cans are on the road, and most of
              Suratgarh has milk before six. Nothing is chilled overnight, nothing is pooled with another farm&rsquo;s,
              and nothing is standardised to hit a number on a label.
            </p>
            <p className="sm mt-2" style={{ color: "var(--on-panel-dim)" }}>
              That is also why the fat varies a little through the year. It follows the season and what the animals
              are eating, the way it always did.
            </p>
            <Link to="/shop" className="btn btn--primary mt-3">
              See what we deliver <Icon.arrow />
            </Link>
          </div>
        </Reveal>
      </div>
    </>
  );
}
