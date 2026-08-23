// Turns one oil-city.ir product page into one D.1 `ScrapeProduct`. Pure: HTML
// in, record out, so it can be tested without a network and re-run over the
// disk cache when a selector turns out to be wrong.
//
// The site runs a custom theme ("nepso-commerce"), not stock WooCommerce, so
// none of the usual WooCommerce selectors apply. What the page does give us:
//
//   .product_details .product_d_right   the ONE real product block. Related
//                                       products further down the page carry
//                                       their own .price_box, so every price
//                                       lookup must be scoped to this or it
//                                       will read a neighbour's price.
//   h1                                  the product name
//   .product_d_meta span                "KEY : VALUE" pairs — برند, نوع, کیفیت,
//                                       درجه گرانروی, حجم
//   .price_box .current_price/.old_price
//   .breadcrumb_content a               home / محصولات / <category> / <product>
//   #DESC                               the description tab
//
// **The JSON-LD on these pages is a trap and is deliberately not used for
// anything.** It looks authoritative and is mostly wrong:
//   - `offers.price`, `lowPrice` and `highPrice` are 0 on every product checked,
//     including ones showing a real price in the page.
//   - `description` is one site-wide marketing sentence, identical everywhere.
//   - `sku` and `mpn` are the WordPress post id (671, 4985). Reading
//     `oemPartNumbers` out of `mpn` would invent part numbers that do not exist
//     — mismatch 3.3 in oil-city-import-notes.md stands: this source has none.

import * as cheerio from "cheerio";
import type { ScrapeCategoryGuess, ScrapeProduct } from "@/lib/validation/import";

export interface ParsedProductPage {
  product: ScrapeProduct | null;
  problems: string[];
}

// Their category slugs happen to be ours, so the guess is a match on the
// source's own taxonomy rather than a reading of Persian prose. EXACT matches
// only: the site also sells `oil-filter-heavy`, `air-filter-heavy`,
// `fuel-filter-heavy`, `battery-filter`, `gearbox-filter` and `bike-oil-engine`,
// none of which are the car part our category of nearly the same name means.
const OUR_CATEGORY_SLUGS = new Set<string>([
  "engine-oil",
  "oil-filter",
  "air-filter",
  "cabin-filter",
  "fuel-filter",
]);

// The price slot holds a price or, failing that, one of these. Both mean "no
// price stated", and they are different reasons: "ناموجود" is out of stock,
// "تماس بگیرید" is call-for-price. Recorded verbatim in `stockRawText` so the
// reviewer sees which — and NOT reported as problems, because a known state is
// not a parse failure. Task G.1 found 63 of the first 200 products saying
// "تماس بگیرید", every one of them filed as an unrecognised price.
const NO_PRICE_STATES = ["ناموجود", "تماس بگیرید"];

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII, so one price parser handles every page. */
export function normaliseDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * A price in whole Toman, or null when the text holds no number — which is what
 * "ناموجود" is. Null means "the page did not state a price", never zero.
 */
export function parseToman(text: string | null | undefined): number | null {
  if (text == null) return null;
  const digits = normaliseDigits(text).replace(/[^0-9]/g, "");
  if (digits === "") return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * The real image URLs on the page, in order.
 *
 * Three things have to be dropped, all of which are the theme rather than the
 * product: inline `data:` placeholders from lazy-loading, anything under
 * `/themes/` (payment badges, icons, and the `default-product.jpg` stand-in a
 * product with no photo gets), and the resizer wrapper — `nepso-timthumb.php`
 * carries the true URL in its own `src` parameter.
 */
export function extractImageUrls($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const urls: string[] = [];

  $(".product_details img").each((_, element) => {
    const raw = $(element).attr("src");
    if (!raw || raw.startsWith("data:")) return;

    let resolved: URL;
    try {
      resolved = new URL(raw, baseUrl);
    } catch {
      return;
    }

    const inner = resolved.searchParams.get("src");
    if (resolved.pathname.includes("timthumb.php") && inner !== null) {
      try {
        resolved = new URL(inner, baseUrl);
      } catch {
        return;
      }
    }

    if (resolved.pathname.includes("/themes/")) return;
    const href = resolved.toString();
    if (!urls.includes(href)) urls.push(href);
  });

  return urls;
}

/** The `KEY : VALUE` badges, verbatim in Persian, as the D.1 `specs` object. */
export function extractSpecs($: cheerio.CheerioAPI): Record<string, string> {
  const specs: Record<string, string> = {};

  $(".product_d_right .product_d_meta span").each((_, element) => {
    const span = $(element);
    const value = span.find("a").text().trim();
    // The key is the span's own text with the linked value removed, minus the
    // trailing colon that separates them.
    const key = span
      .clone()
      .children()
      .remove()
      .end()
      .text()
      .replace(/[:：]\s*$/, "")
      .trim();
    if (key !== "" && value !== "") specs[key] = value;
  });

  return specs;
}

/** The last path segment, percent-decoded — Persian for most products, Latin for some. */
export function sourceSlugFrom(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split("/").filter((segment) => segment !== "");
    const last = segments.at(-1);
    if (last === undefined) return null;
    return decodeURIComponent(last);
  } catch {
    return null;
  }
}

/**
 * Whether the description tab is the theme's fallback rather than a description.
 *
 * A product with nothing written about it still renders the tab, holding either
 * the product's name or the page-title phrasing of it — "قیمت و خرید <name>",
 * which is "price and buy <name>". Importing that as a description would put a
 * sentence about buying on every product page we own. Recognising two exact
 * templates is not a guess about the content; anything else is passed through
 * untouched.
 */
export function isPlaceholderDescription(description: string, nameFa: string | null): boolean {
  if (description === "") return true;
  if (nameFa === null) return false;
  return description === nameFa || description === `قیمت و خرید ${nameFa}`;
}

export function parseProductPage(html: string, url: string): ParsedProductPage {
  const $ = cheerio.load(html);
  const problems: string[] = [];

  const sourceSlug = sourceSlugFrom(url);
  if (sourceSlug === null) {
    return { product: null, problems: [`could not read a slug from the URL`] };
  }

  const right = $(".product_d_right").first();
  if (right.length === 0) {
    // Not a layout to improvise around: without this block there is no way to
    // tell the product's own price from a related product's.
    return {
      product: null,
      problems: ["no .product_d_right block — page layout is not what we expect"],
    };
  }

  const nameFa = right.find("h1").first().text().trim() || null;
  if (nameFa === null) problems.push("no h1 product name");

  // Breadcrumbs run home / محصولات / <category> / <product name>. The category
  // is the last taxonomy link, and its href carries the source's own slug.
  const taxonomyLinks = $(".breadcrumb_content a.bread-tax");
  const categoryLink = taxonomyLinks.last();
  const sourceCategoryText = categoryLink.text().trim() || null;

  let categoryGuess: ScrapeCategoryGuess | null = null;
  const categoryHref = categoryLink.attr("href");
  if (categoryHref !== undefined) {
    try {
      const slug = new URL(categoryHref, url).pathname.split("/").filter(Boolean).at(-1);
      if (slug !== undefined && OUR_CATEGORY_SLUGS.has(slug)) {
        categoryGuess = slug as ScrapeCategoryGuess;
      }
    } catch {
      problems.push(`unreadable category link "${categoryHref}"`);
    }
  }

  const priceBox = right.find(".price_box").first();
  const priceRawText = priceBox.text().replace(/\s+/g, " ").trim() || null;
  const currentText = right.find(".current_price").first().text().trim();
  const oldText = right.find(".old_price").first().text().trim();

  const priceToman = parseToman(currentText);
  const originalPriceToman = parseToman(oldText);

  // The current-price slot doubles as the stock line. Anything there that is
  // neither a price nor a known state is a layout the parser has not seen, and
  // is reported rather than guessed at.
  const noPriceState = NO_PRICE_STATES.find((state) => currentText.includes(state)) ?? null;
  if (priceToman === null && noPriceState === null && currentText !== "") {
    problems.push(`unrecognised price text "${currentText}"`);
  }

  const specs = extractSpecs($);
  const brandLabelFa = specs["برند"] ?? null;

  const descriptionText = $("#DESC").text().replace(/\s+/g, " ").trim();
  const longDescriptionFa = isPlaceholderDescription(descriptionText, nameFa)
    ? null
    : descriptionText;

  return {
    product: {
      sourceSlug,
      nameFa,
      brandLabelFa,
      sourceCategoryText,
      categoryGuess,
      priceToman,
      originalPriceToman,
      priceRawText,
      specs,
      // Always empty, on purpose. See the JSON-LD note at the top of this file.
      oemPartNumbers: [],
      // This theme has no separate short description — one tab, one body.
      shortDescriptionFa: null,
      longDescriptionFa,
      imageUrls: extractImageUrls($, url),
      stockRawText: noPriceState === null ? null : currentText,
      sourceUrl: url,
    },
    problems,
  };
}
