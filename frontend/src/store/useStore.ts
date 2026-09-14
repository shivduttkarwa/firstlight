import { create } from "zustand";
import { ApiError, api, session, tokens, type Address, type Basket, type StaffUser, type User } from "../lib/api";

interface AuthState {
  user: User | null;
  staff: StaffUser | null;
  addresses: Address[];
  baskets: Basket[];
  ready: boolean;

  signIn: (user: User, t: { access: string; refresh: string }) => Promise<void>;
  signInStaff: (staff: StaffUser, t: { access: string; refresh: string }) => void;
  signOut: () => void;
  bootstrap: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loadAddresses: () => Promise<Address[]>;
  loadBaskets: () => Promise<Basket[]>;
}

const STAFF_KEY = "fl.staff";

const isSignedOut = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  staff: null,
  addresses: [],
  baskets: [],
  ready: false,

  signIn: async (user, t) => {
    tokens.set(t);
    localStorage.removeItem(STAFF_KEY);
    set({ staff: null });
    // The user lands last, so no screen sees them signed in without their addresses.
    await Promise.all([get().loadAddresses(), get().loadBaskets()]).catch(() => undefined);
    set({ user });
  },

  signInStaff: (staff, t) => {
    tokens.set(t);
    localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
    set({ staff, user: null, addresses: [], baskets: [] });
  },

  signOut: () => {
    const refresh = tokens.refresh;
    // Retire the refresh token on the server too; fire and forget.
    if (refresh) void api.post("/auth/logout/", { refresh }).catch(() => undefined);
    tokens.clear();
    localStorage.removeItem(STAFF_KEY);
    set({ user: null, staff: null, addresses: [], baskets: [] });
  },

  bootstrap: async () => {
    session.expired = () => {
      localStorage.removeItem(STAFF_KEY);
      set({ user: null, staff: null, addresses: [], baskets: [] });
    };
    if (!tokens.access) {
      set({ ready: true });
      return;
    }
    const stored = localStorage.getItem(STAFF_KEY);
    if (stored) {
      // Staff session: prove the token is still good before trusting the cache.
      try {
        const me = await api.get<User>("/auth/me/");
        if (!me.is_staff) throw new ApiError(403, {});
        set({ staff: JSON.parse(stored) as StaffUser, ready: true });
      } catch (e) {
        if (isSignedOut(e)) {
          tokens.clear();
          localStorage.removeItem(STAFF_KEY);
        }
        set({ staff: null, ready: true });
      }
      return;
    }
    try {
      set({ user: await api.get<User>("/auth/me/") });
    } catch (e) {
      // A dropped connection or a server restart is not a reason to forget the login.
      if (isSignedOut(e)) tokens.clear();
      set({ ready: true });
      return;
    }
    await Promise.all([get().loadAddresses(), get().loadBaskets()]).catch(() => undefined);
    set({ ready: true });
  },

  refreshUser: async () => {
    try {
      set({ user: await api.get<User>("/auth/me/") });
    } catch {
      /* the next bootstrap will sort out a stale token */
    }
  },

  loadAddresses: async () => {
    const addresses = await api.get<Address[]>("/addresses/");
    set({ addresses });
    return addresses;
  },

  loadBaskets: async () => {
    const baskets = await api.get<Basket[]>("/subscriptions/");
    set({ baskets });
    return baskets;
  },
}));

/** Signed in, or holding a token that is still being checked, so pages never flash the signed-out layout. */
export const useSignedIn = () => useAuth((s) => s.user !== null || (!s.ready && tokens.access !== null));

const OFFER_KEY = "fl.offer";

interface OfferState {
  code: string;
  setCode: (code: string) => void;
}

/** The offer code a visitor picked on the home page, carried to wherever they start. */
export const useOffer = create<OfferState>((set) => ({
  code: sessionStorage.getItem(OFFER_KEY) ?? "",
  setCode: (code) => {
    if (code) sessionStorage.setItem(OFFER_KEY, code);
    else sessionStorage.removeItem(OFFER_KEY);
    set({ code });
  },
}));

type ToastKind = "info" | "error";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = "info") => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, kind: ToastKind = "info") => useToasts.getState().push(message, kind);
