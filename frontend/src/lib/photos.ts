/**
 * Editorial photography, served straight off Unsplash.
 * Product cards keep the drawn vessels in ProductArt; photographs are only
 * used where the page is telling a story.
 */

const BASE = "https://images.unsplash.com/";

function src(id: string, w: number, h?: number) {
  const crop = h ? `&h=${h}` : "";
  return `${BASE}${id}?auto=format&fit=crop&w=${w}${crop}&q=72`;
}

interface Photo {
  id: string;
  alt: string;
  credit: string;
}

export const PHOTOS = {
  pour: {
    id: "photo-1550583724-b2692b85b150",
    alt: "Milk being poured into a glass",
    credit: "Anita Jankovic",
  },
  cow: {
    id: "photo-1596522868662-7dacab63591f",
    alt: "A cow standing on dry ground in the morning",
    credit: "Kartikey Das",
  },
  field: {
    id: "photo-1694517112518-3a355d01cc80",
    alt: "A field under morning mist",
    credit: "Marek Piwnicki",
  },
  bottles: {
    id: "photo-1523473827533-2a64d0d36748",
    alt: "Glass milk bottles in a crate",
    credit: "Nikolai Chernichenko",
  },
  curd: {
    id: "photo-1571212515416-fef01fc43637",
    alt: "A bowl of set curd",
    credit: "Sara Cervera",
  },
  ghee: {
    id: "photo-1573812461383-e5f8b759d12e",
    alt: "A jar of ghee with a spoon",
    credit: "Sorin Gheorghita",
  },
  shed: {
    id: "photo-1636998980792-63f27ddea4e3",
    alt: "Cows in an open shed at first light",
    credit: "Bernd Dittrich",
  },
  steel: {
    id: "photo-1596793393770-82081fca1471",
    alt: "A steel milk tank",
    credit: "Alexander Schimmeck",
  },
  road: {
    id: "photo-1647069384985-c6a473d6d628",
    alt: "A rider carrying crates of bottles",
    credit: "Sandy Ravaloniaina",
  },
  gate: {
    id: "photo-1774979159418-c151a2a35766",
    alt: "A delivery handed over at a gate",
    credit: "Getty Images",
  },
} satisfies Record<string, Photo>;

export type PhotoKey = keyof typeof PHOTOS;

/** A photo sized for a given layout width, with a 2x source set. */
export function photo(key: PhotoKey, w: number, h?: number) {
  const p = PHOTOS[key];
  return {
    src: src(p.id, w, h),
    srcSet: `${src(p.id, w, h)} 1x, ${src(p.id, w * 2, h && h * 2)} 2x`,
    alt: p.alt,
    loading: "lazy" as const,
    decoding: "async" as const,
  };
}

/** A photo that fills the viewport: width-described candidates, not 1x/2x. */
export function fullBleed(key: PhotoKey) {
  const p = PHOTOS[key];
  return {
    src: src(p.id, 1600),
    srcSet: [640, 1024, 1600, 2048].map((w) => `${src(p.id, w)} ${w}w`).join(", "),
    sizes: "100vw",
    alt: p.alt,
    decoding: "async" as const,
  };
}

/**
 * One picture per step of the morning round, in order. StepBlock has an image
 * field, but the CMS API returns it as a bare id, so these stand in until the
 * farm's own photographs are wired through.
 */
export const STEP_PHOTOS: PhotoKey[] = ["shed", "steel", "road", "gate"];

/** The three frames the storefront hero cycles through: product, herd, land. */
export const HERO_SLIDES = [
  { key: "pour", caption: "The morning pour" },
  { key: "cow", caption: "Our Rathi cows" },
  { key: "field", caption: "First light over the fodder" },
] satisfies { key: PhotoKey; caption: string }[];
