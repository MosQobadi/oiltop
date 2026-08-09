import "dotenv/config";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "./route";

// Unauthenticated by construction — nothing here signs a token or sets a cookie.
//
// The rate limiter keys on the client IP and its state is process-wide, so
// every test sends its own x-forwarded-for. Without that, the 400 cases would
// eat the 5/hour budget and whichever test ran sixth would fail with a 429.

const PREFIX = "test-sf-inquiry";

function postRequest(body: unknown, ip: string) {
  return new NextRequest("http://localhost/api/storefront/fitment-inquiries", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

let carEngineId: string;
let categoryId: string;

beforeAll(async () => {
  const carBrand = await prisma.carBrand.create({
    data: {
      slug: `${PREFIX}-brand`,
      nameEn: "Inquiry Route Brand",
      nameFa: "برند",
      status: "ACTIVE",
    },
  });
  const carModel = await prisma.carModel.create({
    data: {
      carBrandId: carBrand.id,
      slug: `${PREFIX}-model`,
      nameEn: "Inquiry Route Model",
      nameFa: "مدل",
      status: "ACTIVE",
    },
  });
  const carEngine = await prisma.carEngine.create({
    data: {
      carModelId: carModel.id,
      labelEn: `${PREFIX} Engine`,
      labelFa: "موتور",
      yearStart: 2015,
      yearEnd: 2020,
      fuelType: "PETROL",
      status: "ACTIVE",
    },
  });
  const category = await prisma.category.create({
    data: {
      slug: `${PREFIX}-cat`,
      nameEn: "Inquiry Test Category",
      nameFa: "دسته آزمایشی",
      shortDescriptionEn: "Short",
      shortDescriptionFa: "کوتاه",
      longDescriptionEn: "Long",
      longDescriptionFa: "بلند",
      partType: "ENGINE_OIL",
      status: "ACTIVE",
    },
  });

  carEngineId = carEngine.id;
  categoryId = category.id;
});

afterAll(async () => {
  await prisma.fitmentInquiry.deleteMany({
    where: { customerName: { startsWith: PREFIX } },
  });
  await prisma.carEngine.deleteMany({
    where: { labelEn: { startsWith: PREFIX } },
  });
  await prisma.carModel.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.carBrand.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: PREFIX } } });
});

describe("POST /api/storefront/fitment-inquiries", () => {
  it("creates a FitmentInquiry with status NEW, unauthenticated", async () => {
    const res = await POST(
      postRequest(
        {
          customerName: `${PREFIX} Ada Lovelace`,
          phone: "+98 912 345 6789",
          email: "ada@example.com",
          message: "No oil listed for my car.",
          carEngineId,
          categoryId,
        },
        "10.0.0.1",
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("NEW");

    const row = await prisma.fitmentInquiry.findUniqueOrThrow({
      where: { id: json.data.id },
    });
    expect(row.customerName).toBe(`${PREFIX} Ada Lovelace`);
    expect(row.phone).toBe("+98 912 345 6789");
    expect(row.email).toBe("ada@example.com");
    expect(row.message).toBe("No oil listed for my car.");
    expect(row.carEngineId).toBe(carEngineId);
    expect(row.categoryId).toBe(categoryId);
    expect(row.status).toBe("NEW");
    expect(row.adminNote).toBeNull();
  });

  it("accepts name and phone alone", async () => {
    const res = await POST(
      postRequest(
        { customerName: `${PREFIX} Minimal`, phone: "02112345678" },
        "10.0.0.2",
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    const row = await prisma.fitmentInquiry.findUniqueOrThrow({
      where: { id: json.data.id },
    });
    expect(row.email).toBeNull();
    expect(row.message).toBeNull();
    expect(row.carEngineId).toBeNull();
    expect(row.categoryId).toBeNull();
  });

  it("treats blank optional fields as omitted", async () => {
    const res = await POST(
      postRequest(
        {
          customerName: `${PREFIX} Blanks`,
          phone: "02112345678",
          email: "",
          message: "",
          carEngineId: "",
          categoryId: "",
        },
        "10.0.0.3",
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    const row = await prisma.fitmentInquiry.findUniqueOrThrow({
      where: { id: json.data.id },
    });
    expect(row.email).toBeNull();
    expect(row.carEngineId).toBeNull();
  });

  it("never lets the client choose the status", async () => {
    const res = await POST(
      postRequest(
        {
          customerName: `${PREFIX} Status Spoof`,
          phone: "02112345678",
          status: "RESOLVED",
          adminNote: "already handled",
        },
        "10.0.0.4",
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(201);
    const row = await prisma.fitmentInquiry.findUniqueOrThrow({
      where: { id: json.data.id },
    });
    expect(row.status).toBe("NEW");
    expect(row.adminNote).toBeNull();
  });

  it("returns 400 when customerName is missing", async () => {
    const res = await POST(postRequest({ phone: "02112345678" }, "10.0.0.5"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(typeof json.error).toBe("string");
  });

  it("returns 400 when phone is missing", async () => {
    const res = await POST(
      postRequest({ customerName: `${PREFIX} No Phone` }, "10.0.0.6"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a blank name, a too-short phone, and a bad email", async () => {
    expect(
      (
        await POST(
          postRequest({ customerName: "   ", phone: "02112345678" }, "10.0.0.7"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest({ customerName: `${PREFIX} X`, phone: "123" }, "10.0.0.8"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          postRequest(
            {
              customerName: `${PREFIX} X`,
              phone: "02112345678",
              email: "not-an-email",
            },
            "10.0.0.9",
          ),
        )
      ).status,
    ).toBe(400);
  });

  it("returns 400 for an unknown carEngineId or categoryId", async () => {
    const engineRes = await POST(
      postRequest(
        {
          customerName: `${PREFIX} Bad Engine`,
          phone: "02112345678",
          carEngineId: "does-not-exist",
        },
        "10.0.0.10",
      ),
    );
    expect(engineRes.status).toBe(400);
    expect((await engineRes.json()).error).toBe("Unknown car engine");

    const categoryRes = await POST(
      postRequest(
        {
          customerName: `${PREFIX} Bad Category`,
          phone: "02112345678",
          categoryId: "does-not-exist",
        },
        "10.0.0.11",
      ),
    );
    expect(categoryRes.status).toBe(400);
    expect((await categoryRes.json()).error).toBe("Unknown category");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/storefront/fitment-inquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "10.0.0.12",
        },
        body: "{ not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 once the same IP exceeds 5 submissions an hour", async () => {
    const ip = "10.0.0.99";
    const body = (n: number) => ({
      customerName: `${PREFIX} Flood ${n}`,
      phone: "02112345678",
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await POST(postRequest(body(attempt), ip));
      expect(res.status).toBe(201);
    }

    const blocked = await POST(postRequest(body(6), ip));
    const json = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(json.success).toBe(false);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    // The blocked submission is not written.
    expect(
      await prisma.fitmentInquiry.count({
        where: { customerName: `${PREFIX} Flood 6` },
      }),
    ).toBe(0);
  });

  it("does not penalize a different IP", async () => {
    const res = await POST(
      postRequest(
        { customerName: `${PREFIX} Innocent`, phone: "02112345678" },
        "10.0.0.100",
      ),
    );
    expect(res.status).toBe(201);
  });
});
