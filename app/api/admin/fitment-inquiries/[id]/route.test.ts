import "dotenv/config";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET, PATCH } from "./route";

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

const PREFIX = "test-fitment-inquiry-detail-12-1";

async function signAdminToken(userId: string) {
  return new SignJWT({ userId, role: "ADMIN" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

function getRequest() {
  return new NextRequest("http://localhost/api/admin/fitment-inquiries/x");
}

function patchRequest(body?: unknown) {
  return new NextRequest("http://localhost/api/admin/fitment-inquiries/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let category: { id: string; nameEn: string };
let inquiry: { id: string };

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@topoil.com" },
  });
  cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));

  category = await prisma.category.findUniqueOrThrow({ where: { slug: "engine-oil" } });

  inquiry = await prisma.fitmentInquiry.create({
    data: {
      categoryId: category.id,
      customerName: `${PREFIX} Customer`,
      phone: "+989120000003",
      message: "Need help finding a compatible oil.",
      status: "NEW",
    },
  });
});

afterAll(async () => {
  await prisma.fitmentInquiry.deleteMany({ where: { customerName: { startsWith: PREFIX } } });
});

describe("GET /api/admin/fitment-inquiries/:id", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await GET(getRequest(), ctx(inquiry.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("returns 404 for an unknown inquiry", async () => {
    const res = await GET(getRequest(), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("returns full detail", async () => {
    const res = await GET(getRequest(), ctx(inquiry.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.inquiry).toMatchObject({
      id: inquiry.id,
      customerName: `${PREFIX} Customer`,
      phone: "+989120000003",
      message: "Need help finding a compatible oil.",
      status: "NEW",
      category: { id: category.id, nameEn: category.nameEn },
    });
  });
});

describe("PATCH /api/admin/fitment-inquiries/:id", () => {
  it("rejects an unauthenticated request", async () => {
    cookieJar.clear();
    const res = await PATCH(patchRequest({ status: "CONTACTED" }), ctx(inquiry.id));
    expect(res.status).toBe(401);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@topoil.com" },
    });
    cookieJar.set(process.env.COOKIE_NAME!, await signAdminToken(admin.id));
  });

  it("rejects an empty body", async () => {
    const res = await PATCH(patchRequest({}), ctx(inquiry.id));
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown inquiry", async () => {
    const res = await PATCH(patchRequest({ status: "CONTACTED" }), ctx("does-not-exist"));
    expect(res.status).toBe(404);
  });

  it("updates only status", async () => {
    const res = await PATCH(patchRequest({ status: "CONTACTED" }), ctx(inquiry.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.inquiry.status).toBe("CONTACTED");

    const updated = await prisma.fitmentInquiry.findUniqueOrThrow({ where: { id: inquiry.id } });
    expect(updated.status).toBe("CONTACTED");
    expect(updated.adminNote).toBeNull();
  });

  it("updates status and adminNote together", async () => {
    const res = await PATCH(
      patchRequest({ status: "RESOLVED", adminNote: "Sourced a compatible oil, order placed." }),
      ctx(inquiry.id),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.inquiry).toMatchObject({
      status: "RESOLVED",
      adminNote: "Sourced a compatible oil, order placed.",
    });
  });

  it("updates only adminNote, leaving status untouched", async () => {
    const res = await PATCH(patchRequest({ adminNote: "Follow up next week." }), ctx(inquiry.id));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.inquiry).toMatchObject({
      status: "RESOLVED",
      adminNote: "Follow up next week.",
    });
  });
});
