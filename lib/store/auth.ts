import { create } from "zustand";
import type { AuthUser } from "@/types/auth";

// One store for both trees. The admin panel and the storefront share a single
// session — one JWT in one cookie, read back through one /api/auth/me (design
// brief Section 6) — so a second, storefront-scoped store would be a second
// mirror of the same source of truth, free to disagree with the first inside
// one tab. `role` is what tells the two surfaces apart, not two stores.
//
// It stays client-side rather than seeded from the server because
// `app/[locale]/layout.tsx` is cached (`revalidate = 300`): rendering the
// signed-in customer into the shell would serve one customer's name to
// everyone, and reading the cookie there would throw the caching away.

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  // Takes its destination rather than knowing one: signing out of the admin
  // panel lands on /login, signing out of the storefront on that locale's tree.
  logout: (redirectTo: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  logout: async (redirectTo) => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null, loading: false });
    if (typeof window !== "undefined") {
      window.location.href = redirectTo;
    }
  },
}));

export async function hydrateAuthStore() {
  try {
    const response = await fetch("/api/auth/me");
    const result = await response.json();
    useAuthStore.getState().setUser(result.success ? result.data.user : null);
  } catch {
    useAuthStore.getState().setUser(null);
  }
}

// Kick off hydration as soon as this module is loaded in the browser, so the
// store reflects an existing session before any component reads from it. One
// request per page load, and only in a tree that imports the store at all.
if (typeof window !== "undefined") {
  void hydrateAuthStore();
}
