import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { SETTINGS_KEYS } from "@/lib/validation";
import robots from "./robots";
import sitemap from "./sitemap";

// Runs against a seeded database (`pnpm prisma:seed`), like the storefront
// route tests. Both files read the same Settings toggle, so they're tested
// together — the interesting behavior is that they agree about it.

const TOGGLE_KEY = SETTINGS_KEYS.seo.sitemapEnabled;
const SLUG = "test-sitemap-inactive-category";

let originalToggle: string | null = null;

async function setSitemapEnabled(enabled: boolean) {
  const value = String(enabled);
  await prisma.setting.upsert({
    where: { key: TOGGLE_KEY },
    update: { value },
    create: { key: TOGGLE_KEY, value },
  });
}

beforeAll(async () => {
  const existing = await prisma.setting.findUnique({ where: { key: TOGGLE_KEY } });
  originalToggle = existing?.value ?? null;

  await prisma.category.create({
    data: {
      slug: SLUG,
      nameEn: "Sitemap test (inactive)",
      nameFa: "Sitemap test (inactive)",
      shortDescriptionEn: "",
      shortDescriptionFa: "",
      longDescriptionEn: "",
      longDescriptionFa: "",
      partType: "OTHER",
      status: "INACTIVE",
    },
  });
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: SLUG } });

  if (originalToggle === null) {
    await prisma.setting.deleteMany({ where: { key: TOGGLE_KEY } });
  } else {
    await setSitemapEnabled(originalToggle === "true");
  }
});

describe("sitemap", () => {
  it("is empty while the Settings toggle is off", async () => {
    await setSitemapEnabled(false);
    expect(await sitemap()).toEqual([]);
  });

  it("lists every active resource in both locales once the toggle is on", async () => {
    await setSitemapEnabled(true);
    const urls = (await sitemap()).map((entry) => entry.url);

    // Static entry points, a seeded category, and a seeded product.
    expect(urls).toEqual(
      expect.arrayContaining(
        [
          "/en",
          "/fa",
          "/en/products",
          "/fa/products",
          "/en/categories/engine-oil",
          "/fa/categories/engine-oil",
        ].map(absolute),
      ),
    );

    // Car brand and model pages — SEO pages per admin Design Decision 7.
    expect(urls.filter((url) => url.includes("/cars/")).length).toBeGreaterThan(0);

    // Every URL appears once, and the two trees are the same size.
    expect(new Set(urls).size).toBe(urls.length);
    const en = urls.filter((url) => url.startsWith(absolute("/en")));
    const fa = urls.filter((url) => url.startsWith(absolute("/fa")));
    expect(en.length).toBe(fa.length);
    expect(en.length + fa.length).toBe(urls.length);
  });

  it("excludes inactive rows, the same way the pages themselves 404 them", async () => {
    await setSitemapEnabled(true);
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls.some((url) => url.includes(SLUG))).toBe(false);
  });

  it("cross-links each entry's locale variants", async () => {
    await setSitemapEnabled(true);
    const entries = await sitemap();
    const home = entries.find((entry) => entry.url === absolute("/en"));

    expect(home?.alternates?.languages).toEqual({
      en: absolute("/en"),
      fa: absolute("/fa"),
    });
  });
});

describe("robots", () => {
  it("disallows the funnel, the account area, and the API", async () => {
    const { rules } = await robots();
    const disallow = Array.isArray(rules) ? [] : ((rules.disallow ?? []) as string[]);

    expect(disallow).toEqual(
      expect.arrayContaining(["/en/cart", "/fa/cart", "/en/checkout", "/en/orders", "/api/"]),
    );
  });

  it("advertises the sitemap only while the toggle is on", async () => {
    await setSitemapEnabled(true);
    expect((await robots()).sitemap).toBe(absolute("/sitemap.xml"));

    await setSitemapEnabled(false);
    expect((await robots()).sitemap).toBeUndefined();
  });
});

function absolute(path: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000"}${path}`;
}
