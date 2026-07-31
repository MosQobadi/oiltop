import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const SLUG_PREFIX = "test-fitment-profile-attach-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment-profiles/x/attach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let profile: { id: string };
let carBrand: { id: string };
let carModel: { id: string };
let engineOne: { id: string };
let engineTwo: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  carBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Attach Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  carModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Attach Route",
      nameFa: "مدل آزمایشی",
      carBrandId: carBrand.id,
      status: "ACTIVE",
    },
  });
  engineOne = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine One`,
      labelFa: "موتور یک",
      carModelId: carModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  engineTwo = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine Two`,
      labelFa: "موتور دو",
      carModelId: carModel.id,
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  profile = await prisma.fitmentProfile.create({
    data: { label: `${SLUG_PREFIX} profile` },
  });
});

afterAll(async () => {
  await prisma.carEngineFitmentProfile.deleteMany({ where: { profileId: profile.id } });
  await prisma.fitmentProfile.delete({ where: { id: profile.id } });
  await prisma.carEngine.deleteMany({ where: { labelEn: { startsWith: SLUG_PREFIX } } });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
});

describe("POST /api/admin/fitment-profiles/:id/attach", () => {
  it("bulk-attaches car engines to the profile", async () => {
    const res = await POST(
      requestWithBody({ carEngineIds: [engineOne.id, engineTwo.id] }),
      ctx(profile.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const links = await prisma.carEngineFitmentProfile.findMany({
      where: { profileId: profile.id },
    });
    expect(links).toHaveLength(2);
  });

  it("skips engines that are already attached rather than erroring", async () => {
    const res = await POST(
      requestWithBody({ carEngineIds: [engineOne.id, engineTwo.id] }),
      ctx(profile.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const links = await prisma.carEngineFitmentProfile.findMany({
      where: { profileId: profile.id },
    });
    expect(links).toHaveLength(2);
  });

  it("rejects an empty carEngineIds array", async () => {
    const res = await POST(requestWithBody({ carEngineIds: [] }), ctx(profile.id));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown profile", async () => {
    const res = await POST(
      requestWithBody({ carEngineIds: [engineOne.id] }),
      ctx("does-not-exist"),
    );
    expect(res.status).toBe(404);
  });
});
