import { create } from "zustand";
import { api, tokens, type Address, type Basket, type StaffUser, type User } from "../lib/api";

interface AuthState {
  user: User | null;
  staff: StaffUser | null;
  addresses: Address[];
  baskets: Basket[];
  ready: boolean;

  signIn: (user: User, t: { access: string; refresh: string }) => void;
  signInStaff: (staff: StaffUser, t: { access: string; refresh: string }) => void;
  signOut: () => void;
  bootstrap: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loadAddresses: () => Promise<Address[]>;
  loadBaskets: () => Promise<Basket[]>;
}

const STAFF_KEY = "fl.staff";

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  staff: null,
  addresses: [],
  baskets: [],
  ready: false,

  signIn: (user, t) => {
    tokens.set(t);
    localStorage.removeItem(STAFF_KEY);
    set({ user, staff: null });
    void get().loadAddresses();
    void get().loadBaskets();
  },

  signInStaff: (staff, t) => {
    tokens.set(t);
    localStorage.setItem(STAFF_KEY, JSON.stringify(staff));
    set({ staff, user: null, addresses: [], baskets: [] });
  },

  signOut: () => {
    tokens.clear();
    localStorage.removeItem(STAFF_KEY);
    set({ user: null, staff: null, addresses: [], baskets: [] });
  },

  bootstrap: async () => {
    if (!tokens.access) {
      set({ ready: true });
      return;
    }
    const stored = localStorage.getItem(STAFF_KEY);
    if (stored) {
      // Staff session: prove the token is still good before trusting the cache.
      try {
        await api.get("/farm/overview/");
        set({ staff: JSON.parse(stored) as StaffUser, ready: true });
        return;
      } catch {
        tokens.clear();
        localStorage.removeItem(STAFF_KEY);
        set({ staff: null, ready: true });
        return;
      }
    }
    try {
      const user = await api.get<User>("/auth/me/");
      set({ user });
      await Promise.all([get().loadAddresses(), get().loadBaskets()]);
    } catch {
      tokens.clear();
      set({ user: null });
    } finally {
      set({ ready: true });
    }
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
