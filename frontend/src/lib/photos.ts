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

export function heroImage(slide: HeroSlide, sizes = "100vw") {
  const src = `${HERO_BASE}${slide.key}.webp`;
  return {
    src,
    srcSet: [
      ...HERO_WIDTHS.map((width) => `${HERO_BASE}${slide.key}-${width}.webp ${width}w`),
      `${src} 1672w`,
    ].join(", "),
    sizes,
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

const MORNING_WIDTHS = [480, 720, 1024];
const MORNING_BASE = `${import.meta.env.BASE_URL}images/morning/`;

export type MorningPhotoKey =
  | "morning-shed-wakes"
  | "morning-straight-into-steel"
  | "morning-on-the-road"
  | "morning-at-your-gate";

export function morningImage(key: MorningPhotoKey, sizes = "(min-width: 900px) 540px, 80vw") {
  const src = `${MORNING_BASE}${key}.webp`;
  return {
    src,
    srcSet: [
      ...MORNING_WIDTHS.map((width) => `${MORNING_BASE}${key}-${width}.webp ${width}w`),
      `${src} 1672w`,
    ].join(", "),
    sizes,
    decoding: "async" as const,
  };
}

const STORY_WIDTHS = [480, 720, 1024];
const STORY_BASE = `${import.meta.env.BASE_URL}images/story/`;

export function storyImage(sizes = "(min-width: 900px) 680px, 92vw") {
  const src = `${STORY_BASE}why-us-one-farm.webp`;
  return {
    src,
    srcSet: [
      ...STORY_WIDTHS.map((width) => `${STORY_BASE}why-us-one-farm-${width}.webp ${width}w`),
      `${src} 1586w`,
    ].join(", "),
    sizes,
    alt: "The farm owner carrying a steel milk can past a Rathi cow and Murrah buffalo",
    decoding: "async" as const,
  };
}

type ProductPhotoRole = "packshot" | "detail" | "lifestyle";

interface ProductPhoto {
  src: string;
  alt: string;
  role: ProductPhotoRole;
}

const PRODUCT_PHOTOS: Partial<Record<string, Record<ProductPhotoRole, Omit<ProductPhoto, "role">>>> = {
  "cow-milk": {
    packshot: {
      src: `${import.meta.env.BASE_URL}images/products/cow-milk/cow-milk-packshot.png`,
      alt: "A chilled Firstlight Desi Cow Milk bottle in soft morning light",
    },
    detail: {
      src: `${import.meta.env.BASE_URL}images/products/cow-milk/cow-milk-detail.png`,
      alt: "A chilled Firstlight Desi Cow Milk bottle against a deep green background",
    },
    lifestyle: {
      src: `${import.meta.env.BASE_URL}images/products/cow-milk/cow-milk-lifestyle.png`,
      alt: "Firstlight Desi Cow Milk beside a glass in a sunlit farm kitchen",
    },
  },
  "buffalo-milk": {
    packshot: {
      src: `${import.meta.env.BASE_URL}images/products/buffalo-milk/buffalo-milk-packshot.png`,
      alt: "A chilled Firstlight Murrah Buffalo Milk bottle in soft morning light",
    },
    detail: {
      src: `${import.meta.env.BASE_URL}images/products/buffalo-milk/buffalo-milk-detail.png`,
      alt: "A chilled Firstlight Murrah Buffalo Milk bottle against a deep green background",
    },
    lifestyle: {
      src: `${import.meta.env.BASE_URL}images/products/buffalo-milk/buffalo-milk-lifestyle.png`,
      alt: "Firstlight Murrah Buffalo Milk beside a glass in a sunlit farm kitchen",
    },
  },
  "desi-cow-ghee": {
    packshot: {
      src: `${import.meta.env.BASE_URL}images/products/desi-cow-ghee/desi-cow-ghee-packshot.png`,
      alt: "A Firstlight Desi Cow Ghee jar in soft morning light",
    },
    detail: {
      src: `${import.meta.env.BASE_URL}images/products/desi-cow-ghee/desi-cow-ghee-detail.png`,
      alt: "A Firstlight Desi Cow Ghee jar against a deep green background",
    },
    lifestyle: {
      src: `${import.meta.env.BASE_URL}images/products/desi-cow-ghee/desi-cow-ghee-lifestyle.png`,
      alt: "Firstlight Desi Cow Ghee in a sunlit farm kitchen",
    },
  },
  "buffalo-ghee": {
    packshot: {
      src: `${import.meta.env.BASE_URL}images/products/buffalo-ghee/buffalo-ghee-packshot.png`,
      alt: "A Firstlight Buffalo Ghee jar in soft morning light",
    },
    detail: {
      src: `${import.meta.env.BASE_URL}images/products/buffalo-ghee/buffalo-ghee-detail.png`,
      alt: "A Firstlight Buffalo Ghee jar against a deep green background",
    },
    lifestyle: {
      src: `${import.meta.env.BASE_URL}images/products/buffalo-ghee/buffalo-ghee-lifestyle.png`,
      alt: "Firstlight Buffalo Ghee in a sunlit farm kitchen",
    },
  },
  "fresh-curd": {
    packshot: {
      src: `${import.meta.env.BASE_URL}images/products/fresh-curd/fresh-curd-packshot.png`,
      alt: "A Firstlight Fresh Curd clay pot in soft morning light",
    },
    detail: {
      src: `${import.meta.env.BASE_URL}images/products/fresh-curd/fresh-curd-detail.png`,
      alt: "A Firstlight Fresh Curd clay pot against a deep green background",
    },
    lifestyle: {
      src: `${import.meta.env.BASE_URL}images/products/fresh-curd/fresh-curd-lifestyle.png`,
      alt: "Firstlight Fresh Curd in a sunlit farm kitchen",
    },
  },
  chhach: {
    packshot: {
      src: `${import.meta.env.BASE_URL}images/products/chhach/chhach-packshot.png`,
      alt: "A chilled Firstlight Chhach bottle in soft morning light",
    },
    detail: {
      src: `${import.meta.env.BASE_URL}images/products/chhach/chhach-detail.png`,
      alt: "A chilled Firstlight Chhach bottle against a deep green background",
    },
    lifestyle: {
      src: `${import.meta.env.BASE_URL}images/products/chhach/chhach-lifestyle.png`,
      alt: "Firstlight Chhach beside a glass in a sunlit farm kitchen",
    },
  },
};

export function productPhoto(slug: string, role: ProductPhotoRole = "packshot") {
  const photo = PRODUCT_PHOTOS[slug]?.[role];
  return photo ? { ...photo, role } : null;
}

export function productGallery(slug: string) {
  return (["detail", "lifestyle", "packshot"] as const)
    .map((role) => productPhoto(slug, role))
    .filter((photo): photo is ProductPhoto => photo !== null);
}

/** One local photograph per step of the morning round, in order. */
export const STEP_PHOTOS: MorningPhotoKey[] = [
  "morning-shed-wakes",
  "morning-straight-into-steel",
  "morning-on-the-road",
  "morning-at-your-gate",
];

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
