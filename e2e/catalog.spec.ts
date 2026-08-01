import { test, expect } from "@playwright/test";
import { fillBilingual, selectOption } from "./support/fields";
import { rowContaining } from "./support/table";

// Later steps depend on entities created by earlier ones (the product needs
// the category + brand to already exist), so this flow runs as one ordered
// sequence rather than independent tests.
test.describe.serial("catalog: category → brand → product", () => {
  const stamp = Date.now();
  const categoryName = `E2E Category ${stamp}`;
  const brandName = `E2E Brand ${stamp}`;
  const productName = `E2E Product ${stamp}`;
  const sku = `E2E-SKU-${stamp}`;

  test("create a category", async ({ page }) => {
    await page.goto("/admin/categories/add");

    await fillBilingual(page, 0, categoryName, "دسته آزمایشی");
    await selectOption(page, "Part Type", "Other");
    await fillBilingual(page, 1, "Short description for E2E category.", "توضیح کوتاه آزمایشی.");
    await fillBilingual(
      page,
      2,
      "Long description for the E2E category with enough detail to pass validation.",
      "توضیح بلند آزمایشی با جزئیات کافی برای عبور از اعتبارسنجی.",
    );

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/admin\/categories$/);
    await expect(rowContaining(page, categoryName)).toBeVisible();
  });

  test("create a brand", async ({ page }) => {
    await page.goto("/admin/brands/add");

    await fillBilingual(page, 0, brandName, "برند آزمایشی");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/admin\/brands$/);
    await expect(rowContaining(page, brandName)).toBeVisible();
  });

  test("create a product using the new category and brand, verify it appears in the products list", async ({
    page,
  }) => {
    // Category/Brand select options load via a fetch kicked off on mount —
    // attach the waits before navigating so they can't resolve before we
    // start listening, then await them before opening the Category select,
    // otherwise its popover can open against a still-empty options list.
    const categoryOptionsLoaded = page.waitForResponse((res) =>
      res.url().includes("/api/admin/categories/options"),
    );
    const brandOptionsLoaded = page.waitForResponse((res) =>
      res.url().includes("/api/admin/brands/options"),
    );
    await page.goto("/admin/products/add");
    await categoryOptionsLoaded;
    await brandOptionsLoaded;

    await fillBilingual(page, 0, productName, "محصول آزمایشی");
    await page.getByLabel("SKU", { exact: true }).fill(sku);
    await selectOption(page, "Category", categoryName);
    await selectOption(page, "Brand", brandName);
    await fillBilingual(page, 1, "Short description for E2E product.", "توضیح کوتاه محصول آزمایشی.");
    await fillBilingual(
      page,
      2,
      "Long description for the E2E product with enough detail to pass validation.",
      "توضیح بلند محصول آزمایشی با جزئیات کافی برای عبور از اعتبارسنجی.",
    );
    await page.getByLabel("Price", { exact: true }).fill("1000000");
    await page.getByLabel("Discount %", { exact: true }).fill("0");

    await page.getByRole("button", { name: "Save" }).click();

    await expect(page).toHaveURL(/\/admin\/products$/);
    await page.getByPlaceholder("Search products...").fill(productName);
    const row = rowContaining(page, productName);
    await expect(row).toBeVisible();
    await expect(row).toContainText(categoryName);
    await expect(row).toContainText(brandName);
  });
});
