import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
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

const LABEL_PREFIX = "Test Fitment Profile Items Route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment-profiles/x/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let profile: { id: string };
let engineOilCategory: { id: string };
let oilFilterCategory: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  oilFilterCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "oil-filter" },
  });
  profile = await prisma.fitmentProfile.create({
    data: { label: `${LABEL_PREFIX} Profile` },
  });
});

afterEach(async () => {
  await prisma.fitmentProfileItem.deleteMany({ where: { profileId: profile.id } });
});

afterAll(async () => {
  await prisma.fitmentProfile.deleteMany({ where: { label: { startsWith: LABEL_PREFIX } } });
});

describe("POST /api/admin/fitment-profiles/:id/items", () => {
  it("creates an item", async () => {
    const res = await POST(
      requestWithBody({
        categoryId: engineOilCategory.id,
        climate: "STANDARD",
        specNote: `${LABEL_PREFIX} spec`,
        priority: 0,
      }),
      ctx(profile.id),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.item.category.id).toBe(engineOilCategory.id);
  });

  it("rejects a non-STANDARD climate for a non-ENGINE_OIL category", async () => {
    const res = await POST(
      requestWithBody({
        categoryId: oilFilterCategory.id,
        climate: "HOT",
        specNote: `${LABEL_PREFIX} spec`,
      }),
      ctx(profile.id),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("rejects an item with neither productId nor specNote", async () => {
    const res = await POST(
      requestWithBody({ categoryId: engineOilCategory.id }),
      ctx(profile.id),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it("returns 404 for an unknown profile", async () => {
    const res = await POST(
      requestWithBody({
        categoryId: engineOilCategory.id,
        specNote: `${LABEL_PREFIX} spec`,
      }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });
});
