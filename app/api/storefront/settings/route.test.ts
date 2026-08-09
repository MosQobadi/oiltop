import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SETTINGS_KEYS } from "@/lib/validation";
import { GET } from "./route";

// No next/headers mock and no cookie jar — the route never reaches for a
// session. Run against a seeded database (`pnpm prisma:seed`).

const TOUCHED_KEYS = [
  SETTINGS_KEYS.general.storeName,
  SETTINGS_KEYS.general.supportEmail,
  SETTINGS_KEYS.general.supportPhone,
  SETTINGS_KEYS.general.socialLinks,
  SETTINGS_KEYS.localization.defaultLocale,
  SETTINGS_KEYS.localization.supportedLocales,
  SETTINGS_KEYS.shipping.flatRateFee,
  SETTINGS_KEYS.payment.enabledMethods,
  SETTINGS_KEYS.seo.googleSearchConsoleCode,
];

async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

afterAll(async () => {
  await prisma.setting.deleteMany({ where: { key: { in: TOUCHED_KEYS } } });
});

describe("GET /api/storefront/settings", () => {
  it("returns the storefront subset, unauthenticated", async () => {
    await setSetting(SETTINGS_KEYS.general.storeName, "Top Oil");
    await setSetting(SETTINGS_KEYS.general.supportEmail, "support@topoil.com");
    await setSetting(SETTINGS_KEYS.general.supportPhone, "021-12345678");
    await setSetting(
      SETTINGS_KEYS.general.socialLinks,
      JSON.stringify({ instagram: "https://instagram.com/topoil" }),
    );
    await setSetting(SETTINGS_KEYS.localization.defaultLocale, "FA");
    await setSetting(
      SETTINGS_KEYS.localization.supportedLocales,
      JSON.stringify(["EN", "FA"]),
    );

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.settings).toEqual({
      storeName: "Top Oil",
      supportEmail: "support@topoil.com",
      supportPhone: "021-12345678",
      socialLinks: { instagram: "https://instagram.com/topoil" },
      defaultLocale: "FA",
      supportedLocales: ["EN", "FA"],
    });
  });

  it("never exposes shipping, payment, or SEO settings", async () => {
    await setSetting(SETTINGS_KEYS.shipping.flatRateFee, "50000");
    await setSetting(
      SETTINGS_KEYS.payment.enabledMethods,
      JSON.stringify(["COD", "CARD"]),
    );
    await setSetting(SETTINGS_KEYS.seo.googleSearchConsoleCode, "secret-code");

    const res = await GET();
    const json = await res.json();

    expect(Object.keys(json.data.settings).sort()).toEqual([
      "defaultLocale",
      "socialLinks",
      "storeName",
      "supportEmail",
      "supportPhone",
      "supportedLocales",
    ]);
    expect(JSON.stringify(json.data)).not.toContain("secret-code");
    expect(JSON.stringify(json.data)).not.toContain("50000");
  });

  it("falls back to defaults when nothing is configured", async () => {
    await prisma.setting.deleteMany({ where: { key: { in: TOUCHED_KEYS } } });

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.settings.storeName).toBe("");
    expect(json.data.settings.socialLinks).toBeNull();
    expect(json.data.settings.defaultLocale).toBe("EN");
    expect(json.data.settings.supportedLocales).toEqual(["EN", "FA"]);
  });
});
