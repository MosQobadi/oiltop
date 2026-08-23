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

const PREFIX = "test-fitment-inquiry-12-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest(query: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/fitment-inquiries");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return new NextRequest(url);
}

let carBrand: { id: string };
let carModel: { id: string };
let carEngine: { id: string };
let category: { id: string; nameEn: string };

let inquiryNew: { id: string };
let inquiryContacted: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  category = await prisma.category.findUniqueOrThrow({ where: { slug: "engine-oil" } });

  carBrand = await prisma.carBrand.create({
    data: {
      slug: `${PREFIX}-brand`,
      nameEn: "Test Fitment Inquiry Brand",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  carModel = await prisma.carModel.create({
    data: {
      yearCalendar: "GREGORIAN",
      slug: `${PREFIX}-model`,
      nameEn: "Test Fitment Inquiry Model",
      nameFa: "مدل آزمایشی",
      carBrandId: carBrand.id,
      status: "ACTIVE",
    },
  });
  carEngine = await prisma.carEngine.create({
    data: {
      carModelId: carModel.id,
      labelEn: "1.6L Test Engine",
      labelFa: "موتور آزمایشی",
      yearStart: 2018,
      yearEnd: 2022,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });

  inquiryNew = await prisma.fitmentInquiry.create({
    data: {
      carEngineId: carEngine.id,
      categoryId: category.id,
      customerName: `${PREFIX} Alpha`,
      phone: "+989120000001",
      email: "alpha@example.com",
      status: "NEW",
    },
  });
  inquiryContacted = await prisma.fitmentInquiry.create({
    data: {
      customerName: `${PREFIX} Beta`,
      phone: "+989120000002",
      status: "CONTACTED",
      adminNote: "Called customer",
    },
  });
});

afterAll(async () => {
  await prisma.fitmentInquiry.deleteMany({ where: { customerName: { startsWith: PREFIX } } });
  await prisma.carEngine.deleteMany({ where: { carModelId: carModel.id } });
  await prisma.carModel.delete({ where: { id: carModel.id } });
  await prisma.carBrand.delete({ where: { id: carBrand.id } });
});

describe("GET /api/admin/fitment-inquiries", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest());
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("lists inquiries with joined car engine label and category name", async () => {
    const res = await GET(getRequest({ search: PREFIX }));
    const json = await res.json();

    expect(res.status).toBe(200);
    const item = json.data.items.find((i: { id: string }) => i.id === inquiryNew.id);
    expect(item).toMatchObject({
      customerName: `${PREFIX} Alpha`,
      status: "NEW",
      categoryName: category.nameEn,
    });
    expect(item.carEngineLabel).toContain("1.6L Test Engine");
  });

  it("returns null carEngineLabel/categoryName when unset", async () => {
    const res = await GET(getRequest({ search: PREFIX }));
    const json = await res.json();

    const item = json.data.items.find((i: { id: string }) => i.id === inquiryContacted.id);
    expect(item.carEngineLabel).toBeNull();
    expect(item.categoryName).toBeNull();
  });

  it("filters by status", async () => {
    const res = await GET(getRequest({ search: PREFIX, status: "CONTACTED" }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === inquiryContacted.id)).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === inquiryNew.id)).toBe(false);
  });

  it("searches by customer name", async () => {
    const res = await GET(getRequest({ search: `${PREFIX} Alpha` }));
    const json = await res.json();

    expect(json.data.items.some((i: { id: string }) => i.id === inquiryNew.id)).toBe(true);
    expect(json.data.items.some((i: { id: string }) => i.id === inquiryContacted.id)).toBe(false);
  });
});
