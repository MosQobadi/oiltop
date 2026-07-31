import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE, PATCH } from "./route";

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

const LABEL_PREFIX = "Test Fitment Profile Item Id Route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string, body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment-profiles/x/items/y", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) };
}

let profile: { id: string };
let otherProfile: { id: string };
let engineOilCategory: { id: string };
let oilFilterCategory: { id: string };

async function createTestItem(overrides: Record<string, unknown> = {}) {
  return prisma.fitmentProfileItem.create({
    data: {
      profileId: profile.id,
      categoryId: engineOilCategory.id,
      climate: "STANDARD",
      specNote: `${LABEL_PREFIX} spec`,
      priority: 0,
      ...overrides,
    },
  });
}

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
  otherProfile = await prisma.fitmentProfile.create({
    data: { label: `${LABEL_PREFIX} Other Profile` },
  });
});

afterAll(async () => {
  await prisma.fitmentProfileItem.deleteMany({
    where: { profile: { label: { startsWith: LABEL_PREFIX } } },
  });
  await prisma.fitmentProfile.deleteMany({ where: { label: { startsWith: LABEL_PREFIX } } });
});

describe("PATCH /api/admin/fitment-profiles/:id/items/:itemId", () => {
  it("updates fields and returns the updated item", async () => {
    const item = await createTestItem();
    const res = await PATCH(
      requestWithBody("PATCH", { priority: 5 }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.item.priority).toBe(5);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("returns 404 for an item that doesn't belong to the profile", async () => {
    const item = await createTestItem();
    const res = await PATCH(
      requestWithBody("PATCH", { priority: 1 }),
      ctx(otherProfile.id, item.id),
    );
    expect(res.status).toBe(404);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("rejects a non-STANDARD climate against the item's existing (unchanged) category when it isn't ENGINE_OIL", async () => {
    const item = await createTestItem({
      categoryId: oilFilterCategory.id,
      climate: "STANDARD",
    });

    const res = await PATCH(
      requestWithBody("PATCH", { climate: "HOT" }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("allows switching from a product back to spec-only by explicitly clearing productId", async () => {
    const testProduct = await prisma.product.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const item = await createTestItem({ productId: testProduct.id, specNote: null });

    const res = await PATCH(
      requestWithBody("PATCH", { productId: null, specNote: `${LABEL_PREFIX} now spec-only` }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.item.product).toBeNull();
    expect(json.data.item.specNote).toBe(`${LABEL_PREFIX} now spec-only`);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });
});

describe("DELETE /api/admin/fitment-profiles/:id/items/:itemId", () => {
  it("deletes the item", async () => {
    const item = await createTestItem();
    const res = await DELETE(requestWithBody("DELETE"), ctx(profile.id, item.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const found = await prisma.fitmentProfileItem.findUnique({ where: { id: item.id } });
    expect(found).toBeNull();
  });

  it("returns 404 for an unknown item", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx(profile.id, "does-not-exist"));
    expect(res.status).toBe(404);
  });
});
