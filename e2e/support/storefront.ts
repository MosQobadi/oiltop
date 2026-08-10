import path from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * The storefront is shopped signed-out. `playwright.config.ts` sets the admin
 * session as the default `storageState` for the whole suite, so every
 * storefront spec has to opt back out of it — otherwise "checkout as a guest"
 * is really "checkout while holding a staff cookie", which is a different code
 * path (`app/api/storefront/orders/route.ts` treats an ADMIN as a guest, but
 * only because it deliberately checks for it).
 */
export const SIGNED_OUT = { storageState: { cookies: [], origins: [] } };

/** The admin session global-setup saved — for cross-checking in a second context. */
export const ADMIN_STORAGE_STATE = path.resolve(__dirname, "..", ".auth", "admin.json");

/**
 * Drives the car-finder's Brand → Model → Year steps. Engine is deliberately
 * left to the caller: whether that step even renders is the thing under test
 * (one matching engine auto-resolves on the year, see `useFitmentWizard`).
 *
 * Brands are addressed by slug because that's the option's value; models by
 * label, because theirs is a cuid.
 */
export async function fillCarFinder(
  page: Page,
  car: { brandSlug: string; model: string; year: number },
) {
  await page.getByLabel("Car brand", { exact: true }).selectOption(car.brandSlug);
  // Each step's options only exist once the step before it has fetched them,
  // so wait for the option rather than racing the request.
  const modelSelect = page.getByLabel("Model", { exact: true });
  await expect(modelSelect.locator("option", { hasText: car.model })).toHaveCount(1);
  await modelSelect.selectOption({ label: car.model });

  const yearSelect = page.getByLabel("Year", { exact: true });
  await expect(yearSelect.locator(`option[value="${car.year}"]`)).toHaveCount(1);
  await yearSelect.selectOption(String(car.year));
}

/**
 * The wizard resolves by navigating to `?fit=<carEngineId>` (Design Decision
 * 5), so "we have a car" and "the results are for that car" are the same
 * assertion. Returns the engine id in case a caller needs it.
 */
export async function expectResolvedCar(page: Page, carName: string): Promise<string> {
  await expect(page).toHaveURL(/[?&]fit=/);
  await expect(page.getByRole("heading", { name: carName, level: 1 })).toBeVisible();
  await expect(page.getByTestId("fitment-results")).toBeVisible();

  return new URL(page.url()).searchParams.get("fit") ?? "";
}

/** A results section, addressed by the part type the fitment engine sorted it under. */
export function fitmentSection(page: Page, partType: "ENGINE_OIL" | "FILTER") {
  return page.locator(`[data-testid="fitment-category"][data-category="${partType}"]`);
}
