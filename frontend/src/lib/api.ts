// `||`, not `??`: CI passes an unset variable through as "".
const BASE = import.meta.env.VITE_API_BASE || "/api";

const ACCESS = "fl.access";
const REFRESH = "fl.refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS);
  },
  get refresh() {
    return localStorage.getItem(REFRESH);
  },
  set({ access, refresh }: { access: string; refresh: string }) {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string[]>;

  constructor(status: number, payload: unknown) {
    const fields = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
    const detail = typeof fields.detail === "string" ? fields.detail : null;
    const first = Object.entries(fields).find(([k]) => k !== "detail");
    const fallback =
      first && Array.isArray(first[1]) ? String(first[1][0]) : first ? String(first[1]) : "Something went wrong.";
    super(detail ?? fallback);
    this.status = status;
    this.fields = fields as Record<string, string[]>;
  }
}

/** Set by the store: called once a login can no longer be renewed. */
export const session = { expired: () => {} };

let refreshing: Promise<boolean> | null = null;

async function renew(): Promise<boolean> {
  const sent = tokens.refresh;
  if (!sent) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: sent }),
      });
      // Another tab may have rotated the token first; if so, its new one is ours too.
      if (!res.ok) return tokens.refresh !== sent && !!tokens.refresh;
      const data = await res.json();
      tokens.set({ access: data.access, refresh: data.refresh ?? sent });
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const sentToken = tokens.access;
  if (sentToken) headers.set("Authorization", `Bearer ${sentToken}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, { detail: "No connection. Check your internet and try again." });
  }

  if (res.status === 401 && retry && sentToken) {
    if (await renew()) return request<T>(path, init, false);
    // The login is dead. Forget it, and try once more as a guest: a stale token
    // is rejected even by public pages like the shop.
    tokens.clear();
    session.expired();
    return request<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // An HTML error page from the server or a proxy, not our JSON.
    data = { detail: res.ok ? "Unexpected reply from the server." : "Something went wrong on our side. Please try again." };
    if (res.ok) throw new ApiError(res.status, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  get: <T,>(p: string) => request<T>(p),
  post: <T,>(p: string, data?: unknown) => request<T>(p, { method: "POST", body: data ? body(data) : undefined }),
  patch: <T,>(p: string, data: unknown) => request<T>(p, { method: "PATCH", body: body(data) }),
  put: <T,>(p: string, data: unknown) => request<T>(p, { method: "PUT", body: body(data) }),
  del: <T,>(p: string) => request<T>(p, { method: "DELETE" }),
};

/* ==========================================================
   Shapes
   ========================================================== */

export type Slot = "morning" | "evening";
export type Frequency = "daily" | "alternate" | "weekdays" | "monthly";
export type ProductKind = "milk" | "ghee" | "curd" | "chhach";

export interface Variant {
  id: number;
  label: string;
  quantity: string;
  unit: string;
  price: string;
  compare_at_price: string | null;
  sku: string;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  category: { id: number; name: string; slug: string; tagline: string };
  kind: ProductKind;
  animal: "cow" | "buffalo" | "mixed" | "none";
  tagline: string;
  description: string;
  badge: string;
  fat_percent: string | null;
  snf_percent: string | null;
  shelf_life: string;
  accent: string;
  is_subscribable: boolean;
  slots: Slot[];
  image: string | null;
  image_wide: string | null;
  from_price: string;
  variants: Variant[];
}

export interface ProductBrief {
  id: number;
  name: string;
  slug: string;
  kind: ProductKind;
  animal: string;
  accent: string;
  image: string | null;
  variant_id: number;
  variant_label: string;
  unit_price: string;
}

export interface PackageItem {
  id: number;
  variant: number;
  quantity: number;
  slot: Slot;
  frequency: Frequency;
  weekdays: number[];
  product: ProductBrief;
}

export interface Package {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  serves: string;
  accent: string;
  discount_percent: string;
  is_featured: boolean;
  items: PackageItem[];
  monthly_estimate: string;
}

export interface DayOverride {
  id: number;
  date: string;
  quantity: number;
  note: string;
}

export interface BasketLine {
  id: number;
  variant: number;
  quantity: number;
  slot: Slot;
  frequency: Frequency;
  weekdays: number[];
  start_date: string;
  end_date: string | null;
  unit_price: string;
  is_active: boolean;
  product: ProductBrief;
  overrides: DayOverride[];
  per_delivery: string;
}

export interface Basket {
  id: number;
  address: number;
  package: number | null;
  package_name: string | null;
  discount_percent: string;
  status: "active" | "paused" | "cancelled";
  start_date: string;
  resume_on: string | null;
  lines: BasketLine[];
  address_summary: string;
  monthly_estimate: string;
  next_dates: string[];
  item_count: number;
  created_at: string;
}

export interface CalendarDay {
  date: string;
  total: string;
  lines: {
    line: number;
    quantity: number;
    usual: number;
    slot: Slot;
    name: string;
    variant_label: string;
    accent: string;
    overridden: boolean;
    /** The round is packed: this line can no longer change for this day. */
    locked: boolean;
  }[];
  /** Rounds already packed for this day. */
  locked: Slot[];
  paused: boolean;
}

export type CalendarLine = CalendarDay["lines"][number];

export function changedLines(day: CalendarDay) {
  return day.lines.filter((l) => l.overridden && l.quantity !== l.usual);
}

export interface Address {
  id: number;
  label: "home" | "work" | "other";
  contact_name: string;
  contact_phone: string;
  line1: string;
  landmark: string;
  village: string;
  district: string;
  state: string;
  pincode: string;
  delivery_note: string;
  is_default: boolean;
}

export interface User {
  id: number;
  phone: string;
  full_name: string;
  email: string;
  referral_code: string;
  date_joined: string;
  wallet_balance: string;
  is_staff: boolean;
}

export interface Delivery {
  id: number;
  subscription: number;
  line: number;
  date: string;
  slot: Slot;
  slot_display: string;
  quantity: number;
  unit_price: string;
  total: string;
  status: "scheduled" | "out_for_delivery" | "delivered" | "skipped" | "failed";
  status_display: string;
  delivered_at: string | null;
  product: {
    name: string;
    slug: string;
    accent: string;
    kind: ProductKind;
    variant_label: string;
    image: string | null;
  };
  address_summary: string;
}

export interface WalletTxn {
  id: number;
  kind: "credit" | "debit";
  amount: string;
  balance_after: string;
  note: string;
  created_at: string;
}

export interface Wallet {
  balance: string;
  updated_at: string;
  transactions: WalletTxn[];
  /** Customers may add money themselves (demo only, until a payment gateway). */
  can_top_up: boolean;
}

export interface Summary {
  delivered_this_month: number;
  spend_this_month: string;
  next_delivery: Delivery | null;
  wallet_balance: string;
}

export interface FarmInfo {
  farm: Record<string, string>;
  address_lines: string[];
  slots: { value: Slot; label: string }[];
  cutoffs: Record<string, string>;
}

/* ---- Staff ------------------------------------------------ */

export interface StaffUser {
  id: number;
  username: string;
  full_name: string;
  is_staff: true;
}

export interface RoundStop {
  address_id: number;
  customer_id: number;
  customer: string;
  phone: string;
  line1: string;
  landmark: string;
  village: string;
  pincode: string;
  note: string;
  status: "pending" | "part" | "done";
  value: string;
  wallet_balance: string;
  wallet_low: boolean;
  items: {
    delivery_id: number;
    product: string;
    accent: string;
    kind: ProductKind;
    variant_label: string;
    quantity: number;
    total: string;
    status: string;
  }[];
}

export interface Round {
  date: string;
  slot: Slot;
  totals: { stops: number; items: number; value: string; done: number; pending: number };
  stops: RoundStop[];
}

export interface FarmOverview {
  today: string;
  slots: Record<Slot, { items: number; stops: number; done: number; value: string }>;
  month: { delivered: number; value: string };
  customers: { total: number; active: number; new_this_month: number };
  low_wallets: { id: number; name: string; phone: string; balance: string }[];
  tomorrow: { product: string; variant: string; slot: Slot; packs: number }[];
}

export interface CustomerRow {
  id: number;
  name: string;
  phone: string;
  joined: string;
  active_subscriptions: number;
  wallet_balance: string;
}

export interface CustomerDetail extends CustomerRow {
  email: string;
  addresses: (Address & { note: string })[];
  subscriptions: Basket[];
  upcoming: {
    id: number;
    date: string;
    slot: Slot;
    product: string;
    variant_label: string;
    quantity: number;
    total: string;
    status: string;
  }[];
  recent_transactions: {
    id: number;
    kind: string;
    amount: string;
    balance_after: string;
    note: string;
    at: string;
  }[];
}

export interface SiteContent {
  hero_eyebrow: string;
  hero_heading: string;
  hero_subheading: string;
  hero_cta_label: string;
  story_heading: string;
  story_body: string;
}

/* ---- CMS -------------------------------------------------- */

export interface HomeContent {
  hero_eyebrow: string;
  hero_heading: string;
  hero_subheading: string;
  hero_cta_label: string;
  hero_image: { url: string; width: number; height: number } | null;
  story_heading: string;
  story_body: string;
  body: CmsBlock[];
}

export type CmsBlock =
  | { type: "stats"; id: string; value: { value: string; label: string }[] }
  | { type: "process"; id: string; value: { time: string; title: string; body: string }[] }
  | { type: "testimonials"; id: string; value: { quote: string; name: string; place: string }[] }
  | { type: "faqs"; id: string; value: { question: string; answer: string }[] }
  | { type: "section"; id: string; value: Record<string, unknown> };

export async function fetchHomeContent(): Promise<HomeContent | null> {
  try {
    const res = await api.get<{ items: HomeContent[] }>(
      "/cms/pages/?type=website.HomePage&fields=hero_eyebrow,hero_heading,hero_subheading,hero_cta_label,hero_image,story_heading,story_body,body&limit=1",
    );
    return res.items[0] ?? null;
  } catch {
    return null;
  }
}
