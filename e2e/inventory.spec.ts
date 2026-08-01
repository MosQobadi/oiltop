import { test, expect } from "@playwright/test";
import { rowContaining } from "./support/table";

const PRODUCT_NAME = "Mobil 1 5W-30 Advanced Fully Synthetic";
// Seeded stock for this product (prisma/seed.ts) — asserting against the
// exact new total (40 + 10) proves the add actually applied, not just that
// *some* number changed.
const SEEDED_STOCK = 40;
const ADD_STOCK = 10;

test("edit a product's stock via Inventory and verify the list updates", async ({ page }) => {
  await page.goto("/admin/inventory");
  await page.getByPlaceholder("Search inventory...").fill(PRODUCT_NAME);

  const row = rowContaining(page, PRODUCT_NAME);
  await expect(row).toBeVisible();
  await expect(row).toContainText(String(SEEDED_STOCK));

  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Stock" })).toBeVisible();

  await page.getByLabel("Add Stock", { exact: true }).fill(String(ADD_STOCK));
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Edit Stock" })).toHaveCount(0);
  await expect(row).toContainText(String(SEEDED_STOCK + ADD_STOCK));
});
