import { create } from "zustand";
import type { AuthUser } from "@/types/auth";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null, loading: false });
    if (typeof window !== "undefined") {
      window.location.href = "/login";
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
// store reflects an existing session before any component reads from it.
if (typeof window !== "undefined") {
  void hydrateAuthStore();
}
