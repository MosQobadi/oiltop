import { test, expect, type Page } from "@playwright/test";
import { SIGNED_OUT } from "./support/storefront";

// Locale is routing, not a library (Design Decision 2): `/en/...` and `/fa/...`
// are two trees over one layout, and the switcher is two real links rather than
// a control that mutates state. Two things have to hold for that to work —
// switching keeps you on the page you were reading, and the document actually
// flips direction — and neither is visible from a unit test of `switchLocalePath`.

test.use(SIGNED_OUT);

async function expectDocument(page: Page, locale: "en" | "fa") {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("lang", locale);
  await expect(html).toHaveAttribute("dir", locale === "fa" ? "rtl" : "ltr");
}

/**
 * `LocaleSwitcher` reads `useSearchParams()` behind a Suspense boundary whose
 * fallback is the same switcher minus the query string, so while the page is
 * streaming both copies are briefly in the DOM — and the fallback's links drop
 * the query. Settling on one is what makes "the switcher carries the query"
 * a real assertion rather than a coin flip over which copy got clicked.
 */
async function localeLink(page: Page, locale: "en" | "fa") {
  await expect(page.getByTestId("locale-switcher")).toHaveCount(1);
  return page.getByTestId(`locale-switcher-${locale}`);
}

test("switching locale keeps the path and flips the document direction", async ({ page }) => {
  // A path with a query string, because the switcher carries `?…` too — a
  // customer mid-filter should not be dropped back to an unfiltered list.
  await page.goto("/en/products?category=engine-oil&brand=castrol");
  await expectDocument(page, "en");
  await expect(page.getByTestId("product-card")).toHaveCount(2);

  await (await localeLink(page, "fa")).click();

  await expect(page).toHaveURL("/fa/products?category=engine-oil&brand=castrol");
  await expectDocument(page, "fa");
  // Same two products, now named in Persian — the filter survived the switch
  // rather than being reapplied to an empty grid.
  await expect(page.getByTestId("product-card")).toHaveCount(2);
  await expect(page.getByTestId("product-grid")).toContainText("کاسترول مگناتک 5W-40");

  // And back, so the switch is reversible rather than a one-way door.
  await (await localeLink(page, "en")).click();
  await expect(page).toHaveURL("/en/products?category=engine-oil&brand=castrol");
  await expectDocument(page, "en");
});

test("keeps a nested path when switching, and marks the current locale", async ({ page }) => {
  await page.goto("/en/cars/peugeot/206");
  await expectDocument(page, "en");

  await expect(await localeLink(page, "en")).toHaveAttribute("aria-current", "true");

  await (await localeLink(page, "fa")).click();

  // Slugs are locale-independent (Design Decision 2's single-slug rule), so
  // only the first segment changes.
  await expect(page).toHaveURL("/fa/cars/peugeot/206");
  await expectDocument(page, "fa");
  await expect(await localeLink(page, "fa")).toHaveAttribute("aria-current", "true");
});
