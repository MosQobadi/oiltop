import { afterEach, describe, expect, it } from "vitest";
import {
  absoluteUrl,
  carBrandPath,
  carModelPath,
  categoryPath,
  disallowedPaths,
  localizedEntries,
  productPath,
  siteOrigin,
  STATIC_SITEMAP_PATHS,
} from "./sitemap";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("siteOrigin", () => {
  it("falls back to localhost when unconfigured, so dev and tests still build URLs", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(siteOrigin()).toBe("http://localhost:3000");
  });

  it("treats a blank value as unset rather than emitting protocol-less URLs", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "   ";
    expect(siteOrigin()).toBe("http://localhost:3000");
  });

  it("strips trailing slashes so paths don't double up", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://topoil.ir///";
    expect(siteOrigin()).toBe("https://topoil.ir");
    expect(absoluteUrl("/en/cart")).toBe("https://topoil.ir/en/cart");
  });
});

describe("resource paths", () => {
  it("builds one locale-prefixed URL per resource type", () => {
    expect(productPath("en", "mobil-1-5w30")).toBe("/en/products/mobil-1-5w30");
    expect(categoryPath("fa", "engine-oil")).toBe("/fa/categories/engine-oil");
    expect(carBrandPath("en", "peugeot")).toBe("/en/cars/peugeot");
    expect(carModelPath("fa", "peugeot", "206")).toBe("/fa/cars/peugeot/206");
  });
});

describe("localizedEntries", () => {
  it("emits both locale variants of one page", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://topoil.ir";
    const entries = localizedEntries((locale) => categoryPath(locale, "oil-filter"));

    expect(entries.map((entry) => entry.url)).toEqual([
      "https://topoil.ir/en/categories/oil-filter",
      "https://topoil.ir/fa/categories/oil-filter",
    ]);
  });

  // The point of a locale-aware sitemap: each variant names the other, so the
  // two URLs are one page in two languages rather than duplicate content.
  it("cross-links the variants through alternates.languages", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://topoil.ir";
    const entries = localizedEntries((locale) => productPath(locale, "castrol-edge-5w30"));

    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        en: "https://topoil.ir/en/products/castrol-edge-5w30",
        fa: "https://topoil.ir/fa/products/castrol-edge-5w30",
      });
    }
  });

  it("carries lastModified and the crawl hints through to both variants", () => {
    const lastModified = new Date("2026-03-01T00:00:00.000Z");
    const entries = localizedEntries((locale) => carBrandPath(locale, "bmw"), {
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    });

    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(entry.lastModified).toBe(lastModified);
      expect(entry.changeFrequency).toBe("monthly");
      expect(entry.priority).toBe(0.7);
    }
  });
});

describe("STATIC_SITEMAP_PATHS", () => {
  it("covers the pages with no database row behind them", () => {
    expect(STATIC_SITEMAP_PATHS).toEqual(["", "/products", "/fitment"]);
  });

  it("never lists a path robots.txt disallows", () => {
    const disallowed = disallowedPaths();
    for (const path of STATIC_SITEMAP_PATHS) {
      expect(disallowed).not.toContain(`/en${path}`);
      expect(disallowed).not.toContain(`/fa${path}`);
    }
  });
});

describe("disallowedPaths", () => {
  it("blocks the funnel and the account area in both locales, plus the API", () => {
    expect(disallowedPaths()).toEqual([
      "/en/cart",
      "/en/checkout",
      "/en/login",
      "/en/register",
      "/en/orders",
      "/en/profile",
      "/fa/cart",
      "/fa/checkout",
      "/fa/login",
      "/fa/register",
      "/fa/orders",
      "/fa/profile",
      "/api/",
    ]);
  });

  // A Disallow is a prefix match, so the bare path has to cover its children —
  // the order detail and the confirmation receipt are as private as their
  // parents.
  it("uses prefixes that also cover nested pages", () => {
    const disallowed = disallowedPaths();
    const nested = ["/en/orders/ord_123", "/fa/checkout/confirmation"];

    for (const path of nested) {
      expect(disallowed.some((rule) => path.startsWith(rule))).toBe(true);
    }
  });
});
