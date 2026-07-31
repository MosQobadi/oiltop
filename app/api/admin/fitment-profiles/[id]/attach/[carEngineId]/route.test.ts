import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE } from "./route";

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

const SLUG_PREFIX = "test-fitment-profile-detach-route";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function requestWithBody(method: string) {
  return new NextRequest("http://localhost/api/admin/fitment-profiles/x/attach/y", {
    method,
  });
}

function ctx(id: string, carEngineId: string) {
  return { params: Promise.resolve({ id, carEngineId }) };
}

let profile: { id: string };
let carEngine: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${SLUG_PREFIX}-brand`,
      nameEn: "Test Brand For Detach Route",
      nameFa: "برند آزمایشی",
      status: "ACTIVE",
    },
  });
  const carModel = await prisma.carModel.create({
    data: {
      slug: `${SLUG_PREFIX}-model`,
      nameEn: "Test Model For Detach Route",
      nameFa: "مدل آزمایشی",
      carBrandId: carBrand.id,
      status: "ACTIVE",
    },
  });
  carEngine = await prisma.carEngine.create({
    data: {
      labelEn: `${SLUG_PREFIX} Engine`,
      labelFa: "موتور آزمایشی",
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

describe("DELETE /api/admin/fitment-profiles/:id/attach/:carEngineId", () => {
  it("detaches the car engine from the profile", async () => {
    await prisma.carEngineFitmentProfile.create({
      data: { carEngineId: carEngine.id, profileId: profile.id },
    });

    const res = await DELETE(requestWithBody("DELETE"), ctx(profile.id, carEngine.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    const link = await prisma.carEngineFitmentProfile.findFirst({
      where: { carEngineId: carEngine.id, profileId: profile.id },
    });
    expect(link).toBeNull();
  });

  it("is a no-op when the link doesn't exist", async () => {
    const res = await DELETE(requestWithBody("DELETE"), ctx(profile.id, carEngine.id));
    expect(res.status).toBe(200);
  });
});
