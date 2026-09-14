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

const WIDTHS = [360, 540, 720, 960, 1280, 1600, 2000];

/** A photo cropped to w×h, offered at several widths. `sizes` says how wide it
    actually shows, so a phone takes the small file instead of the desktop one. */
export function photo(key: PhotoKey, w: number, h?: number, sizes = `(min-width: 900px) ${w}px, 92vw`) {
  const p = PHOTOS[key];
  const ratio = h ? h / w : undefined;
  const at = (width: number) => src(p.id, width, ratio && Math.round(width * ratio));
  return {
    src: at(w),
    srcSet: WIDTHS.filter((width) => width <= w * 2)
      .map((width) => `${at(width)} ${width}w`)
      .join(", "),
    sizes,
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

const HERO_WIDTHS = [640, 1024];
const HERO_BASE = `${import.meta.env.BASE_URL}images/hero/`;

interface HeroSlide {
  key: string;
  caption: string;
}

export function heroImage(slide: HeroSlide) {
  const src = `${HERO_BASE}${slide.key}.webp`;
  return {
    src,
    srcSet: [
      ...HERO_WIDTHS.map((width) => `${HERO_BASE}${slide.key}-${width}.webp ${width}w`),
      `${src} 1672w`,
    ].join(", "),
    sizes: "100vw",
    decoding: "async" as const,
  };
}

const OFFER_WIDTHS = [480, 720, 1024];
const OFFER_BASE = `${import.meta.env.BASE_URL}images/offers/`;

export type OfferPhotoKey = "offer-first-month-delivery" | "offer-bilona-ghee" | "offer-refer-neighbour";

export function offerImage(key: OfferPhotoKey, sizes = "(min-width: 900px) 600px, 92vw") {
  const src = `${OFFER_BASE}${key}.webp`;
  return {
    src,
    srcSet: [
      ...OFFER_WIDTHS.map((width) => `${OFFER_BASE}${key}-${width}.webp ${width}w`),
      `${src} 1448w`,
    ].join(", "),
    sizes,
    decoding: "async" as const,
  };
}

/**
 * One picture per step of the morning round, in order. StepBlock has an image
 * field, but the CMS API returns it as a bare id, so these stand in until the
 * farm's own photographs are wired through.
 */
export const STEP_PHOTOS: PhotoKey[] = ["shed", "steel", "road", "gate"];

/** The three local frames the storefront hero cycles through. */
export const HERO_SLIDES = [
  {
    key: "hero-fodder-fields-first-light",
    caption: "First light over the fodder",
  },
  {
    key: "hero-suratgarh-farm-track-sunrise",
    caption: "The road through our fields",
  },
  {
    key: "hero-rathi-cows-clean-shelter",
    caption: "Our Rathi cows",
  },
] satisfies HeroSlide[];
