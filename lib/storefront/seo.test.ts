import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { firstFilled, localeAlternates } from "./seo";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://topoil.ir";
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

describe("firstFilled", () => {
  it("takes the first value with something in it", () => {
    expect(firstFilled(null, "", "  ", "Mobil 1", "Castrol")).toBe("Mobil 1");
  });

  it("returns undefined rather than an empty string, so the tag is omitted", () => {
    expect(firstFilled(null, undefined, "   ")).toBeUndefined();
  });
});

describe("localeAlternates", () => {
  it("declares both trees, whichever one is rendering", () => {
    const languages = {
      en: "https://topoil.ir/en/products/mobil-1-5w30",
      fa: "https://topoil.ir/fa/products/mobil-1-5w30",
    };

    expect(localeAlternates("en", "/products/mobil-1-5w30")?.languages).toEqual(languages);
    expect(localeAlternates("fa", "/products/mobil-1-5w30")?.languages).toEqual(languages);
  });

  // An hreflang set is only honoured when each member is canonical, so the page
  // has to point at itself — not at the other locale, and not at a variant.
  it("self-canonicalizes to the rendering locale's own URL", () => {
    expect(localeAlternates("fa", "/categories/oil-filter")?.canonical).toBe(
      "https://topoil.ir/fa/categories/oil-filter",
    );
  });

  it("builds the site root of each tree from an empty path", () => {
    expect(localeAlternates("en", "")).toEqual({
      canonical: "https://topoil.ir/en",
      languages: { en: "https://topoil.ir/en", fa: "https://topoil.ir/fa" },
    });
  });

  // The same URLs the sitemap emits for the same resource — the two have to
  // agree or they describe different pages.
  it("matches the sitemap's absolute URLs", async () => {
    const { productPath, absoluteUrl } = await import("./sitemap");
    expect(localeAlternates("en", "/products/castrol-edge")?.canonical).toBe(
      absoluteUrl(productPath("en", "castrol-edge")),
    );
  });
});
