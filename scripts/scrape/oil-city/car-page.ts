// Turns one oil-city.ir car model page into one D.1 `ScrapeCar` — the fitment
// data this whole phase exists for. Pure: HTML in, record out.
//
// The page is a Bootstrap accordion. Each section is a `#headingN` / `#collapseN`
// pair, in page order:
//
//   #headingN   "روغن موتور خودرو (با فیلتر روغن 3.9 لیتر ...) برای تویوتا > CHR توربو 1200"
//               section name, capacity in parentheses, and the car restated
//   #collapseN  a `نکته` note, then the recommended products as .single_product cards
//
// Only `#headingN` / `#collapseN` with a NUMERIC suffix are sections. The page
// also carries `#collapseOne` and `#collapseContent`, which are a promo panel
// and the SEO article — neither is a recommendation.
//
// **The car has no breadcrumb and no dedicated name element.** The `<h1>` holds
// the brand in an `<a class="badge">` plus prose that varies between models
// ("روغن موتور هایلوکس" on one, "هانک 150" on another), so it cannot give the
// model name. What is consistent is the tail of every section heading — the page
// restating its own car as "برای <brand> > <model>" — and that is where both
// names come from.
//
// **"فیلترها" is one section holding every filter type at once** — cabin, oil and
// gearbox filters side by side — rather than a section per filter. So a filter
// section cannot carry a single `categoryGuess`, and the individual filters are
// identified downstream by their own product pages, which each state a category.
// This is why `productSourceUrl` matters more here than the section's guess.

import * as cheerio from "cheerio";
import type { ScrapeCar, ScrapeCarSection, ScrapeCategoryGuess } from "@/lib/validation/import";

export interface ParsedCarPage {
  car: ScrapeCar | null;
  problems: string[];
}

// The one section heading that maps onto a category we carry. Matched exactly
// and only here: "روغن موتور سیکلت" is MOTORCYCLE oil and must not become
// engine-oil, "فیلترها" is several of our categories at once, and coolant,
// brake fluid, ATF, additives and air freshener are none of them. Everything
// unmatched keeps its heading verbatim and guesses nothing.
const SECTION_CATEGORY: Record<string, ScrapeCategoryGuess> = {
  "روغن موتور خودرو": "engine-oil",
};

/** "برای تویوتا > هایلوکس 2005-2013" → brand and model, as the page states them. */
export function carNamesFromHeading(
  heading: string,
): { brandNameFa: string; modelNameFa: string } | null {
  const match = /\sبرای\s+(.+?)\s*>\s*(.+)$/u.exec(heading.replace(/\s+/g, " ").trim());
  if (match === null) return null;

  const brandNameFa = match[1].trim();
  const modelNameFa = match[2].trim();
  if (brandNameFa === "" || modelNameFa === "") return null;
  return { brandNameFa, modelNameFa };
}

/**
 * The section's own name — the heading with the capacity and the "برای <car>"
 * tail removed, so it can be matched against SECTION_CATEGORY. The full heading
 * is still recorded verbatim; this is only used to decide the guess.
 */
export function sectionNameFrom(heading: string): string {
  const normalised = heading.replace(/\s+/g, " ").trim();
  const withoutCar = normalised.replace(/\sبرای\s+.+$/u, "");
  return withoutCar.replace(/\s*\(.*$/u, "").trim();
}

/** Whatever the first parentheses hold — "با فیلتر روغن 3.9 لیتر بدون فیلتر روغن 3.6 لیتر". */
export function capacityFrom(heading: string): string | null {
  const match = /\(([^)]*)\)/u.exec(heading.replace(/\s+/g, " "));
  const inner = match?.[1].trim();
  return inner === undefined || inner === "" ? null : inner;
}

/** The last path segment, percent-decoded; car slugs are Persian more often than not. */
function slugSegments(url: string): string[] | null {
  try {
    return new URL(url).pathname
      .split("/")
      .filter((segment) => segment !== "")
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
}

/** Whether a note holds only its own "نکته :" label and no note. */
export function isBareNoteLabel(noteText: string): boolean {
  return noteText.replace(/^نکته\s*[:：]?\s*/u, "").trim() === "";
}

function parseSection(
  $: cheerio.CheerioAPI,
  index: number,
  problems: string[],
): ScrapeCarSection | null {
  const heading = $(`#heading${index}`);
  const body = $(`#collapse${index}`);
  if (heading.length === 0 || body.length === 0) return null;

  const headingFa = heading.text().replace(/\s+/g, " ").trim() || null;

  // The note is a `نکته :` label inside the body; its container holds the note
  // text and nothing else worth having. Products live in their own cards.
  //
  // Some sections render the label with nothing after it. That is an empty note,
  // not a note reading "نکته :", and recording the bare label would give the
  // reviewer a spec note that says only "note:".
  const noteLabel = body.find("b.text-danger").first();
  const noteText =
    noteLabel.length === 0 ? "" : noteLabel.parent().text().replace(/\s+/g, " ").trim();
  const specNoteFa = isBareNoteLabel(noteText) ? null : noteText;

  // One card per recommended product, in page order. A card links to the same
  // product twice — once from its image, once from its title — so the card is
  // the unit, not the link, and the name comes from whichever link has text.
  const products = body
    .find(".single_product")
    .map((orderOnPage, card) => {
      const links = $(card).find("a[href*='/product/']");
      const href = links.first().attr("href") ?? null;
      const nameFa =
        links
          .map((_, link) => $(link).text().replace(/\s+/g, " ").trim())
          .get()
          .find((text) => text !== "") ?? null;

      let productSourceUrl: string | null = null;
      if (href !== null) {
        try {
          productSourceUrl = new URL(href, "https://www.oil-city.ir").toString();
        } catch {
          problems.push(`section ${index}: unreadable product link "${href}"`);
        }
      }

      return { nameFa, productSourceUrl, orderOnPage };
    })
    .get();

  const sectionName = headingFa === null ? "" : sectionNameFrom(headingFa);

  return {
    headingFa,
    categoryGuess: SECTION_CATEGORY[sectionName] ?? null,
    capacityText: headingFa === null ? null : capacityFrom(headingFa),
    specNoteFa,
    products,
  };
}

export function parseCarPage(html: string, url: string): ParsedCarPage {
  const $ = cheerio.load(html);
  const problems: string[] = [];

  const segments = slugSegments(url);
  if (segments === null || segments.length < 3) {
    return { car: null, problems: ["URL is not /car/<brand>/<model>/"] };
  }
  const [, brandSourceSlug, modelSourceSlug] = segments;

  // Sections are numbered from zero and contiguous; the first gap ends them.
  const sections: ScrapeCarSection[] = [];
  for (let index = 0; ; index += 1) {
    const section = parseSection($, index, problems);
    if (section === null) break;
    sections.push(section);
  }

  if (sections.length === 0) {
    // No accordion at all. Reported rather than emitted as a car with no
    // recommendations, which would be indistinguishable from a car that has none.
    return { car: null, problems: [...problems, "no recommendation sections on the page"] };
  }

  // Every section restates the car, so the first one that parses answers it.
  const names = sections
    .map((section) => (section.headingFa === null ? null : carNamesFromHeading(section.headingFa)))
    .find((parsed) => parsed !== null && parsed !== undefined);

  if (names == null) {
    return {
      car: null,
      problems: [...problems, 'no section heading of the form "... برای <brand> > <model>"'],
    };
  }

  // Cross-check against the brand badge in the h1. A disagreement is reported
  // and neither value is corrected — same rule as a product's brand label.
  const badgeBrand = $("h1 a.badge").first().text().replace(/\s+/g, " ").trim();
  if (badgeBrand !== "" && badgeBrand !== names.brandNameFa) {
    problems.push(
      `brand disagreement: headings say "${names.brandNameFa}", the title badge says "${badgeBrand}"`,
    );
  }

  return {
    car: {
      brandNameFa: names.brandNameFa,
      brandSourceSlug,
      modelNameFa: names.modelNameFa,
      modelSourceSlug,
      // The source has no separate descriptor field. What a descriptor would
      // hold — "توربو 1200", "2005-2013" — is already inside modelNameFa, and
      // splitting one out would be deriving a field from another rather than
      // reading one off the page.
      modelDescriptorText: null,
      sourceUrl: url,
      sections,
    },
    problems,
  };
}
