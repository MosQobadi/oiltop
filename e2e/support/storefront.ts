import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

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
 * Picks an option from a `SelectMenu` (components/storefront/SelectMenu.tsx).
 *
 * These are listboxes, not native <select>s — the open menu is a portaled
 * element at the end of <body>, so there is no `selectOption` and no `option`
 * child to wait on. The trigger is addressed by test id because its accessible
 * name includes the current value, and every option is addressed by the text a
 * customer actually reads.
 *
 * `scope` narrows the *trigger* only, for pages that render the same component
 * twice (dev-preview shows both wizard modes). The options never need it: only
 * one menu is ever open.
 */
export async function chooseFromMenu(
  page: Page,
  testId: string,
  optionLabel: string,
  scope: Page | Locator = page,
) {
  const trigger = scope.getByTestId(testId);
  // The menu is per-trigger and only one is ever open, so this is unambiguous.
  const option = page.getByRole("option", { name: optionLabel, exact: true });

  // Opening is retried rather than clicked once. The trigger is a React-driven
  // button, so a click that lands before the page hydrates does nothing at all
  // — and a native <select> gave no way to tell that apart from a step whose
  // options simply have not been fetched yet. Re-clicking covers both: a click
  // on an already-open menu closes it, and the next attempt opens it again.
  await expect(async () => {
    await trigger.click();
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await option.click();
  // Closing is what proves the click landed on the option rather than on an
  // overlay that was still animating in.
  await expect(option).toBeHidden();
}

/**
 * Drives the car-finder's Brand → Model → Year steps. Engine is deliberately
 * left to the caller: whether that step even renders is the thing under test
 * (one matching engine auto-resolves on the year, see `useFitmentWizard`).
 *
 * Every step is addressed by its visible label — a listbox has no option
 * values, so the brand's slug and the model's cuid are equally unusable here.
 */
export async function fillCarFinder(
  page: Page,
  car: { brand: string; model: string; year: number },
) {
  await chooseFromMenu(page, "fitment-select-brand", car.brand);
  await chooseFromMenu(page, "fitment-select-model", car.model);
  await chooseFromMenu(page, "fitment-select-year", String(car.year));
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
