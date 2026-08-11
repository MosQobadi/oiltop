import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

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

const PRODUCT_SKU_PREFIX = "TEST-SPEC-MATCHES";

// Deliberately a grade no seed product carries, so the counts below are counts
// of this test's own rows rather than of whatever the catalog happens to hold.
const TEST_VISCOSITY = "0W-16";
const TEST_API_GRADE = "SP-TEST";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

async function authenticateAsAdmin() {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
}

function requestWithQuery(query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return new NextRequest(`http://localhost/api/admin/fitment-profiles/spec-matches?${params}`);
}

let engineOilCategory: { id: string };

beforeAll(async () => {
  await authenticateAsAdmin();

  engineOilCategory = await prisma.category.findUniqueOrThrow({
    where: { slug: "engine-oil" },
  });
  const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "mobil-1" } });

  async function createProduct(
    name: string,
    data: { price: number; status: "ACTIVE" | "INACTIVE"; viscosity: string; apiGrade: string },
  ) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return prisma.product.create({
      data: {
        sku: `${PRODUCT_SKU_PREFIX}-${unique}`,
        slug: `${PRODUCT_SKU_PREFIX.toLowerCase()}-${unique}`,
        nameEn: name,
        nameFa: "محصول آزمایشی",
        categoryId: engineOilCategory.id,
        brandId: brand.id,
        discountPercent: 0,
        tags: [],
        oemPartNumbers: [],
        volumeMl: 4000,
        shortDescriptionEn: "Short",
        shortDescriptionFa: "کوتاه",
        longDescriptionEn: "Long",
        longDescriptionFa: "بلند",
        ...data,
      },
    });
  }

  await createProduct("Spec Match Cheap", {
    price: 100,
    status: "ACTIVE",
    viscosity: TEST_VISCOSITY,
    apiGrade: TEST_API_GRADE,
  });
  await createProduct("Spec Match Dear", {
    price: 900,
    status: "ACTIVE",
    viscosity: TEST_VISCOSITY,
    apiGrade: TEST_API_GRADE,
  });
  // The two rows the spec must not count: one deactivated, one a different grade.
  await createProduct("Spec Match Deactivated", {
    price: 50,
    status: "INACTIVE",
    viscosity: TEST_VISCOSITY,
    apiGrade: TEST_API_GRADE,
  });
  await createProduct("Spec Match Other Grade", {
    price: 60,
    status: "ACTIVE",
    viscosity: "0W-8",
    apiGrade: TEST_API_GRADE,
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { sku: { startsWith: PRODUCT_SKU_PREFIX } } });
});

describe("GET /api/admin/fitment-profiles/spec-matches", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(requestWithQuery({ categoryId: "cat_1", viscosity: TEST_VISCOSITY }));
    expect(res.status).toBe(401);

    await authenticateAsAdmin();
  });

  it("counts only the active products the spec matches, cheapest first", async () => {
    const res = await GET(
      requestWithQuery({
        categoryId: engineOilCategory.id,
        viscosity: TEST_VISCOSITY,
        apiGrade: TEST_API_GRADE,
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.total).toBe(2);
    expect(json.data.products.map((product: { nameEn: string }) => product.nameEn)).toEqual([
      "Spec Match Cheap",
      "Spec Match Dear",
    ]);
  });

  // The admin types the grade however they type it; the columns are uppercase.
  it("normalises a lower-case spec before matching", async () => {
    const res = await GET(
      requestWithQuery({
        categoryId: engineOilCategory.id,
        viscosity: TEST_VISCOSITY.toLowerCase(),
        apiGrade: TEST_API_GRADE.toLowerCase(),
      }),
    );
    const json = await res.json();

    expect(json.data.total).toBe(2);
  });

  it("narrows on volumeMl when it is supplied", async () => {
    const res = await GET(
      requestWithQuery({
        categoryId: engineOilCategory.id,
        viscosity: TEST_VISCOSITY,
        volumeMl: "5000",
      }),
    );
    const json = await res.json();

    expect(json.data.total).toBe(0);
    expect(json.data.products).toEqual([]);
  });

  it("rejects a query with no spec keys", async () => {
    const res = await GET(requestWithQuery({ categoryId: engineOilCategory.id }));

    expect(res.status).toBe(400);
  });

  it("rejects a viscosity that isn't a grade", async () => {
    const res = await GET(
      requestWithQuery({ categoryId: engineOilCategory.id, viscosity: "thin-ish" }),
    );

    expect(res.status).toBe(400);
  });
});
