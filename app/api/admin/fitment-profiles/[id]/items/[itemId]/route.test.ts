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
// The product one test attaches to an item. Created here rather than picked
// with `findFirstOrThrow({ where: { status: "ACTIVE" } })`: test files run in
// parallel against the shared database and most of them create ACTIVE products
// they later delete, so an arbitrary one can vanish mid-test.
let testProduct: { id: string };

const PRODUCT_SKU_PREFIX = "test-fp-item-id-route";

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

  const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "mobil-1" } });
  testProduct = await prisma.product.create({
    data: {
      // Suffixed so an interrupted run that skipped cleanup can't collide with
      // the next one on the unique sku/slug.
      sku: `${PRODUCT_SKU_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      slug: `${PRODUCT_SKU_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      nameEn: "Test Product For Fitment Item Route",
      nameFa: "محصول آزمایشی",
      categoryId: engineOilCategory.id,
      brandId: brand.id,
      price: 1000,
      discountPercent: 0,
      tags: [],
      oemPartNumbers: [],
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.fitmentProfileItem.deleteMany({
    where: { profile: { label: { startsWith: LABEL_PREFIX } } },
  });
  await prisma.fitmentProfile.deleteMany({ where: { label: { startsWith: LABEL_PREFIX } } });
  // After the items, which reference it.
  await prisma.product.deleteMany({ where: { sku: { startsWith: PRODUCT_SKU_PREFIX } } });
});

describe("PATCH /api/admin/fitment-profiles/:id/items/:itemId", () => {
  it("updates fields and returns the updated item", async () => {
    const item = await createTestItem();
    const res = await PATCH(requestWithBody("PATCH", { priority: 5 }), ctx(profile.id, item.id));
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

    const res = await PATCH(requestWithBody("PATCH", { climate: "HOT" }), ctx(profile.id, item.id));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("leaves climate and priority alone when the patch doesn't mention them", async () => {
    const item = await createTestItem({ climate: "HOT", priority: 3 });

    const res = await PATCH(
      requestWithBody("PATCH", { adminNote: `${LABEL_PREFIX} checked` }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.item.climate).toBe("HOT");
    expect(json.data.item.priority).toBe(3);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  // The item's stored climate has to be fed into the cross-field rule, or a
  // patch that only moves the category slips a HOT item under a filter.
  it("rejects moving a HOT item to a non-oil category without changing its climate", async () => {
    const item = await createTestItem({ climate: "HOT", priority: 0 });

    const res = await PATCH(
      requestWithBody("PATCH", { categoryId: oilFilterCategory.id }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/climate must be STANDARD/i);

    const unchanged = await prisma.fitmentProfileItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(unchanged.categoryId).toBe(engineOilCategory.id);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("allows moving a HOT item to a non-oil category when the climate is reset in the same patch", async () => {
    const item = await createTestItem({ climate: "HOT", priority: 0 });

    const res = await PATCH(
      requestWithBody("PATCH", {
        categoryId: oilFilterCategory.id,
        climate: "STANDARD",
      }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.item.climate).toBe("STANDARD");

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("allows switching from a product back to spec-only by explicitly clearing productId", async () => {
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

  it("leaves an existing matchSpec alone when the patch doesn't mention it", async () => {
    const item = await createTestItem({ matchSpec: { viscosity: "5W-30" } });

    const res = await PATCH(
      requestWithBody("PATCH", { adminNote: `${LABEL_PREFIX} checked` }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.item.matchSpec).toEqual({ viscosity: "5W-30" });

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  // Same hole the climate rule has: without the stored spec being fed back into
  // validation, a patch that only moves the category strands an oil spec on a
  // filter item, where nothing can ever match it.
  it("rejects moving a spec-matched item to a non-oil category", async () => {
    const item = await createTestItem({ matchSpec: { viscosity: "5W-30", apiGrade: "SN" } });

    const res = await PATCH(
      requestWithBody("PATCH", { categoryId: oilFilterCategory.id }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/matchSpec is only allowed/i);

    const unchanged = await prisma.fitmentProfileItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(unchanged.categoryId).toBe(engineOilCategory.id);

    await prisma.fitmentProfileItem.delete({ where: { id: item.id } });
  });

  it("allows moving a spec-matched item to a non-oil category when the same patch clears the spec", async () => {
    const item = await createTestItem({ matchSpec: { viscosity: "5W-30" } });

    const res = await PATCH(
      requestWithBody("PATCH", { categoryId: oilFilterCategory.id, matchSpec: null }),
      ctx(profile.id, item.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.item.matchSpec).toBeNull();

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
