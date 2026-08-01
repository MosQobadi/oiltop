import { test, expect, type Page } from "@playwright/test";
import { fillBilingual, selectOption, searchAndPick } from "./support/fields";
import { rowContaining } from "./support/table";

// A category's fitment items render under an <h2>{categoryName}</h2> group
// in the Fitment Preview tool — scope assertions to that group's container
// (the h2's parent) so "Mobil 1 5W-30..." etc. can't accidentally match
// content from a different category's group on the same page.
function categoryGroup(page: Page, categoryName: string) {
  return page.locator("h2", { hasText: categoryName }).locator("..");
}

test.describe.serial("fitment: car brand → model → engine → fitment profile → preview", () => {
  const stamp = Date.now();
  const brandName = `E2E Car Brand ${stamp}`;
  const modelName = `E2E Model ${stamp}`;
  const engineLabel = `E2E Engine ${stamp}`;
  const yearStart = "2020";

  test("create a car brand", async ({ page }) => {
    await page.goto("/admin/cars/brands/add");
    await fillBilingual(page, 0, brandName, "برند خودرو آزمایشی");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/admin\/cars\/brands$/);
    await expect(rowContaining(page, brandName)).toBeVisible();
  });

  test("create a car model under that brand", async ({ page }) => {
    await page.goto("/admin/cars/brands");
    await rowContaining(page, brandName).getByRole("button", { name: "Models" }).click();
    await expect(page).toHaveURL(/\/models$/);

    await page.getByRole("button", { name: "+ Add Model" }).click();
    await fillBilingual(page, 0, modelName, "مدل آزمایشی");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(rowContaining(page, modelName)).toBeVisible();
  });

  test("create a car engine under that model", async ({ page }) => {
    await page.goto("/admin/cars/brands");
    await rowContaining(page, brandName).getByRole("button", { name: "Models" }).click();
    await rowContaining(page, modelName).getByRole("button", { name: "Engines" }).click();
    await expect(page).toHaveURL(/\/engines$/);

    await page.getByRole("button", { name: "+ Add Engine" }).click();
    await fillBilingual(page, 0, engineLabel, "موتور آزمایشی");
    await page.getByLabel("Year Start", { exact: true }).fill(yearStart);
    await selectOption(page, "Fuel Type", "Petrol");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(rowContaining(page, engineLabel)).toBeVisible();
  });

  test("add a fitment recommendation with a product and a spec-only fallback, then verify both in Fitment Preview", async ({
    page,
  }) => {
    await page.goto("/admin/cars/brands");
    await rowContaining(page, brandName).getByRole("button", { name: "Models" }).click();
    await rowContaining(page, modelName).getByRole("button", { name: "Engines" }).click();
    await rowContaining(page, engineLabel).getByRole("button", { name: "Edit" }).click();

    // Creates a fresh FitmentProfile, auto-attaches it to this engine, and
    // navigates straight to the profile's detail page.
    await page.getByRole("button", { name: "Create New Profile for This Engine" }).click();
    await expect(page).toHaveURL(/\/admin\/cars\/fitment-profiles\/[^/]+$/);

    // Both the profile page (Label/Internal Note) and the item modal have
    // their own "Save" button visible at the same time, so scope to the
    // modal specifically rather than the ambiguous page-wide button.
    const itemModal = page.getByRole("dialog");

    // Item 1: Engine Oil, matched to a seeded catalog product.
    await page.getByRole("button", { name: "+ Add Item" }).click();
    await selectOption(page, "Category", "Engine Oil");
    await searchAndPick(
      page,
      "Product",
      "OIL-MOB-5W30",
      "Mobil 1 5W-30 Advanced Fully Synthetic (OIL-MOB-5W30)",
      "/api/admin/products",
    );
    await page.getByLabel("Priority", { exact: true }).fill("1");
    await itemModal.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("No items yet.")).toHaveCount(0);

    // Item 2: Air Filter, spec-only — no product match yet, just a spec note.
    await page.getByRole("button", { name: "+ Add Item" }).click();
    await selectOption(page, "Category", "Air Filter");
    await page
      .getByLabel("Spec Note", { exact: true })
      .fill("No catalog match yet — needs a standard panel air filter.");
    await page.getByLabel("Priority", { exact: true }).fill("1");
    await itemModal.getByRole("button", { name: "Save" }).click();

    // Each select's options load via a fetch triggered by the previous
    // selection (Car Brand on mount, Car Model once a brand is picked, Year
    // once a model is picked) — attach each wait before the action that
    // triggers its fetch, otherwise the next popover can open against a
    // still-empty list.
    const carBrandsLoaded = page.waitForResponse((res) =>
      res.url().includes("/api/admin/car-brands?"),
    );
    await page.goto("/admin/cars/preview");
    await carBrandsLoaded;

    const carModelsLoaded = page.waitForResponse((res) =>
      res.url().includes("/api/admin/car-models?"),
    );
    await selectOption(page, "Car Brand", brandName);
    await carModelsLoaded;

    const carEnginesLoaded = page.waitForResponse((res) =>
      res.url().includes("/api/admin/car-engines?"),
    );
    await selectOption(page, "Car Model", modelName);
    await carEnginesLoaded;

    await selectOption(page, "Year", yearStart);

    const engineOil = categoryGroup(page, "Engine Oil");
    await expect(engineOil.getByText("Mobil 1 5W-30 Advanced Fully Synthetic")).toBeVisible();

    const airFilter = categoryGroup(page, "Air Filter");
    await expect(airFilter.getByText("Spec only — not yet in catalog")).toBeVisible();
    await expect(
      airFilter.getByText("No catalog match yet — needs a standard panel air filter."),
    ).toBeVisible();
  });
});
