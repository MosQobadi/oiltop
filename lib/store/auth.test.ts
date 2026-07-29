import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateAuthStore, useAuthStore } from "./auth";
import type { AuthUser } from "@/types/auth";

const testUser: AuthUser = {
  id: "user_1",
  email: "admin@topoil.test",
  firstName: "Admin",
  lastName: "User",
  role: "ADMIN",
};

beforeEach(() => {
  useAuthStore.setState({ user: null, loading: true });
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hydrateAuthStore", () => {
  it("sets the user and clears loading on a successful /api/auth/me response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { user: testUser } })),
    );

    await hydrateAuthStore();

    expect(useAuthStore.getState()).toMatchObject({ user: testUser, loading: false });
  });

  it("clears the user when not authenticated", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: "Not authenticated" }), {
        status: 401,
      }),
    );

    await hydrateAuthStore();

    expect(useAuthStore.getState()).toMatchObject({ user: null, loading: false });
  });

  it("clears the user when the request fails outright", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));

    await hydrateAuthStore();

    expect(useAuthStore.getState()).toMatchObject({ user: null, loading: false });
  });
});

describe("useAuthStore.logout", () => {
  it("calls the logout endpoint and clears the store", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, data: null })));
    useAuthStore.setState({ user: testUser, loading: false });

    await useAuthStore.getState().logout();

    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(useAuthStore.getState()).toMatchObject({ user: null, loading: false });
  });
});
