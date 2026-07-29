import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

beforeEach(() => {
  cookieJar.clear();
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookie", async () => {
    cookieJar.set(process.env.COOKIE_NAME!, "some-token");

    const res = await POST();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(cookieJar.has(process.env.COOKIE_NAME!)).toBe(false);
  });
});
