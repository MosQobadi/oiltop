import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET, POST } from "./route";

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

const LABEL_PREFIX = "Test Fitment Profile Route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithQuery(query: Record<string, string> = {}) {
  const params = new URLSearchParams(query);
  return new NextRequest(`http://localhost/api/admin/fitment-profiles?${params.toString()}`);
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment-profiles", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
});

afterAll(async () => {
  await prisma.fitmentProfile.deleteMany({
    where: { label: { startsWith: LABEL_PREFIX } },
  });
});

describe("GET /api/admin/fitment-profiles", () => {
  it("lists fitment profiles with item and linked-engine counts", async () => {
    const profile = await prisma.fitmentProfile.create({
      data: { label: `${LABEL_PREFIX} List` },
    });

    const res = await GET(requestWithQuery({ search: LABEL_PREFIX }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    const found = json.data.fitmentProfiles.find((p: { id: string }) => p.id === profile.id);
    expect(found).toBeDefined();
    expect(found.itemCount).toBe(0);
    expect(found.linkedEngineCount).toBe(0);
  });

  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(requestWithQuery());
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });
});

describe("POST /api/admin/fitment-profiles", () => {
  it("creates a fitment profile", async () => {
    const res = await POST(requestWithBody("POST", { label: `${LABEL_PREFIX} Created` }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.fitmentProfile.label).toBe(`${LABEL_PREFIX} Created`);
  });

  it("rejects a missing label", async () => {
    const res = await POST(requestWithBody("POST", {}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
