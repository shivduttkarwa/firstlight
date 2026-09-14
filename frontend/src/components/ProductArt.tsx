import type { ProductKind } from "../lib/api";

/**
 * Products without a photo get a drawn vessel: a flat ink outline with the
 * product accent poured into it. Milk goes in a bottle, ghee in a jar, curd in
 * a clay matka, chhach in a tumbler, and anything else the farm adds in a tub.
 */

interface Props {
  kind: ProductKind;
  accent: string;
  className?: string;
  size?: string;
}

interface Shape {
  shell: string;
  fill: string;
  surface: string;
}

const SHAPES: Partial<Record<ProductKind, Shape>> = {
  // Tall bottle with a shoulder and a crimped cap.
  milk: {
    shell: "M40 20 h20 v14 c0 7 21 11 21 29 v61 a12 12 0 0 1 -12 12 h-38 a12 12 0 0 1 -12 -12 v-61 c0 -18 21 -22 21 -29 z",
    fill: "M19 74 h62 v48 a12 12 0 0 1 -12 12 h-38 a12 12 0 0 1 -12 -12 z",
    surface: "M19 74 h62 v7 h-62 z",
  },
  // Squat wide-mouth jar.
  ghee: {
    shell: "M24 48 h52 a8 8 0 0 1 8 8 v70 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 v-70 a8 8 0 0 1 8 -8 z",
    fill: "M16 66 h68 v60 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 z",
    surface: "M16 66 h68 v7 h-68 z",
  },
  // Earthen matka: wide belly, narrow neck, flared rim.
  curd: {
    shell: "M36 34 h28 v10 c18 8 26 24 26 44 c0 28 -16 48 -40 48 s-40 -20 -40 -48 c0 -20 8 -36 26 -44 z",
    fill: "M11 76 h78 v12 c0 28 -16 48 -39 48 s-39 -20 -39 -48 z",
    surface: "M11 76 h78 v7 h-78 z",
  },
  // Tapered tumbler.
  chhach: {
    shell: "M30 40 h40 l-5 90 a10 10 0 0 1 -10 9 h-10 a10 10 0 0 1 -10 -9 z",
    fill: "M28 62 h44 l-4 68 a10 10 0 0 1 -10 9 h-10 a10 10 0 0 1 -10 -9 z",
    surface: "M28 62 h44 v7 h-44 z",
  },
};

// A lidded tub, for paneer, butter or anything else.
const TUB: Shape = {
  shell: "M22 58 h56 l-5 68 a9 9 0 0 1 -9 8 h-28 a9 9 0 0 1 -9 -8 z",
  fill: "M10 84 h80 v56 h-80 z",
  surface: "M10 84 h80 v7 h-80 z",
};

export function ProductArt({ kind, accent, className, size = "56%" }: Props) {
  const shape = SHAPES[kind] ?? TUB;
  const clip = `clip-${kind.replace(/[^a-z0-9]/gi, "")}-${accent.replace("#", "")}`;

  return (
    <svg viewBox="0 0 100 150" className={className} style={{ width: size }} role="img" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={shape.shell} />
        </clipPath>
      </defs>

      {/* body */}
      <path d={shape.shell} fill="var(--surface)" />

      {/* contents, clipped to the vessel */}
      <g clipPath={`url(#${clip})`}>
        <path d={shape.fill} fill={accent} />
        <path d={shape.surface} fill="var(--ink)" opacity="0.14" />
      </g>

      {/* outline */}
      <path d={shape.shell} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />

      {kind === "milk" && (
        <>
          <rect x="36" y="9" width="28" height="14" fill={accent} />
          <rect x="36" y="9" width="28" height="14" fill="none" stroke="var(--ink)" strokeWidth="2.2" />
          <path d="M40 34 h20" stroke="var(--ink)" strokeWidth="2" opacity="0.5" />
        </>
      )}

      {kind === "ghee" && (
        <>
          <rect x="20" y="31" width="60" height="17" fill={accent} />
          <rect x="20" y="31" width="60" height="17" fill="none" stroke="var(--ink)" strokeWidth="2.2" />
          <rect x="31" y="86" width="38" height="26" fill="var(--surface)" opacity="0.7" />
          <rect x="31" y="86" width="38" height="26" fill="none" stroke="var(--ink)" strokeWidth="1.6" opacity="0.4" />
        </>
      )}

      {kind === "curd" && (
        <>
          <rect x="29" y="29" width="42" height="12" fill={accent} />
          <rect x="29" y="29" width="42" height="12" fill="none" stroke="var(--ink)" strokeWidth="2.2" />
          <path d="M22 96 q28 8 56 0" stroke="var(--ink)" strokeWidth="1.8" fill="none" opacity="0.35" />
        </>
      )}

      {kind === "chhach" && (
        <>
          <rect x="28" y="35" width="44" height="9" fill={accent} />
          <rect x="28" y="35" width="44" height="9" fill="none" stroke="var(--ink)" strokeWidth="2.2" />
          <rect x="42" y="78" width="4" height="4" fill="#fff" opacity="0.7" />
          <rect x="55" y="94" width="3" height="3" fill="#fff" opacity="0.6" />
          <rect x="46" y="106" width="3" height="3" fill="#fff" opacity="0.55" />
        </>
      )}

      {shape === TUB && (
        <>
          <rect x="17" y="46" width="66" height="12" fill={accent} />
          <rect x="17" y="46" width="66" height="12" fill="none" stroke="var(--ink)" strokeWidth="2.2" />
          <rect x="42" y="39" width="16" height="7" fill="none" stroke="var(--ink)" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
