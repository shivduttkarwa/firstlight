import type { ProductKind } from "../lib/api";

/**
 * We have no product photography yet, so each product gets a drawn vessel:
 * a flat ink outline with the product accent poured into it. Milk goes in a
 * bottle, ghee in a jar, curd in a clay matka, chhach in a tumbler.
 */

interface Props {
  kind: ProductKind;
  accent: string;
  className?: string;
  size?: string;
}

export function ProductArt({ kind, accent, className, size = "56%" }: Props) {
  const id = `${kind}-${accent.replace("#", "")}`;
  const clip = `clip-${id}`;

  const shells: Record<ProductKind, string> = {
    // Tall bottle with a shoulder and a crimped cap.
    milk: "M40 20 h20 v14 c0 7 21 11 21 29 v61 a12 12 0 0 1 -12 12 h-38 a12 12 0 0 1 -12 -12 v-61 c0 -18 21 -22 21 -29 z",
    // Squat wide-mouth jar.
    ghee: "M24 48 h52 a8 8 0 0 1 8 8 v70 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 v-70 a8 8 0 0 1 8 -8 z",
    // Earthen matka: wide belly, narrow neck, flared rim.
    curd: "M36 34 h28 v10 c18 8 26 24 26 44 c0 28 -16 48 -40 48 s-40 -20 -40 -48 c0 -20 8 -36 26 -44 z",
    // Tapered tumbler.
    chhach: "M30 40 h40 l-5 90 a10 10 0 0 1 -10 9 h-10 a10 10 0 0 1 -10 -9 z",
  };

  const fills: Record<ProductKind, string> = {
    milk: "M19 74 h62 v48 a12 12 0 0 1 -12 12 h-38 a12 12 0 0 1 -12 -12 z",
    ghee: "M16 66 h68 v60 a10 10 0 0 1 -10 10 h-48 a10 10 0 0 1 -10 -10 z",
    curd: "M11 76 h78 v12 c0 28 -16 48 -39 48 s-39 -20 -39 -48 z",
    chhach: "M28 62 h44 l-4 68 a10 10 0 0 1 -10 9 h-10 a10 10 0 0 1 -10 -9 z",
  };

  const surfaces: Record<ProductKind, string> = {
    milk: "M19 74 h62 v7 h-62 z",
    ghee: "M16 66 h68 v7 h-68 z",
    curd: "M11 76 h78 v7 h-78 z",
    chhach: "M28 62 h44 v7 h-44 z",
  };

  return (
    <svg viewBox="0 0 100 150" className={className} style={{ width: size }} role="img" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d={shells[kind]} />
        </clipPath>
      </defs>

      {/* body */}
      <path d={shells[kind]} fill="var(--surface)" />

      {/* contents, clipped to the vessel */}
      <g clipPath={`url(#${clip})`}>
        <path d={fills[kind]} fill={accent} />
        <path d={surfaces[kind]} fill="var(--ink)" opacity="0.14" />
      </g>

      {/* outline */}
      <path d={shells[kind]} fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinejoin="round" />

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
    </svg>
  );
}
