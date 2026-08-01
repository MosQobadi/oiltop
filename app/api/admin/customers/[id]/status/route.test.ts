import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH } from "./route";

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

const PREFIX = "test-customer-status-11-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function patchRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/customers/x/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let admin: { id: string };
let customer: { id: string };

beforeAll(async () => {
  admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  customer = await prisma.user.create({
    data: {
      email: `${PREFIX}@example.com`,
      passwordHash: "unused",
      firstName: "Status",
      lastName: "Tester",
      role: "CUSTOMER",
      status: "ACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: customer.id } });
});

describe("PATCH /api/admin/customers/:id/status", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await PATCH(patchRequest({ status: "INACTIVE" }), ctx(customer.id));
    expect(res.status).toBe(401);

    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("returns 404 for an unknown customer", async () => {
    const res = await PATCH(patchRequest({ status: "INACTIVE" }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-customer user (admin)", async () => {
    const res = await PATCH(patchRequest({ status: "INACTIVE" }), ctx(admin.id));
    expect(res.status).toBe(404);
  });

  it("rejects an invalid status value", async () => {
    const res = await PATCH(patchRequest({ status: "BANNED" }), ctx(customer.id));
    expect(res.status).toBe(400);
  });

  it("toggles status to Inactive and back to Active", async () => {
    const toInactive = await PATCH(patchRequest({ status: "INACTIVE" }), ctx(customer.id));
    const inactiveJson = await toInactive.json();
    expect(toInactive.status).toBe(200);
    expect(inactiveJson.data.customer.status).toBe("INACTIVE");

    const toActive = await PATCH(patchRequest({ status: "ACTIVE" }), ctx(customer.id));
    const activeJson = await toActive.json();
    expect(toActive.status).toBe(200);
    expect(activeJson.data.customer.status).toBe("ACTIVE");
  });
});
