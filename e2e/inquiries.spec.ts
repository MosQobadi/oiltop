import { test, expect } from "@playwright/test";
import { selectOption } from "./support/fields";
import { rowContaining } from "./support/table";

// Seeded as NEW (prisma/seed.ts) — the only seeded inquiry for this
// customer, so searching by name resolves to exactly one row.
const CUSTOMER_NAME = "Amir Rezaei";

test("submit a fitment inquiry status change and confirm it persists", async ({ page }) => {
  await page.goto("/admin/inquiries");
  await page.getByPlaceholder("Search by name, phone, or email...").fill(CUSTOMER_NAME);

  const row = rowContaining(page, CUSTOMER_NAME);
  await expect(row).toBeVisible();
  await expect(row).toContainText("New");
  await row.getByRole("button", { name: "View" }).click();

  await expect(page.getByRole("heading", { name: CUSTOMER_NAME, level: 1 })).toBeVisible();

  await selectOption(page, "Status", "Contacted");
  await page.getByRole("button", { name: "Save" }).click();

  // Confirm the change was actually persisted server-side, not just held in
  // local component state, by reloading before checking.
  await page.reload();
  // StatusPill is a sibling of the h1's own wrapper div, not a descendant of
  // it — go up one more level to the shared flex container that holds both.
  await expect(
    page
      .getByRole("heading", { name: CUSTOMER_NAME, level: 1 })
      .locator("../..")
      .getByText("Contacted"),
  ).toBeVisible();

  await page.goto("/admin/inquiries");
  await page.getByPlaceholder("Search by name, phone, or email...").fill(CUSTOMER_NAME);
  await expect(rowContaining(page, CUSTOMER_NAME)).toContainText("Contacted");
});
