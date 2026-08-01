import { test, expect } from "@playwright/test";
import { rowContaining } from "./support/table";

// Seeded as PENDING (prisma/seed.ts) — the only seeded order for this
// customer, so searching by name resolves to exactly one row.
const CUSTOMER_NAME = "Sara Ahmadi";

test("advance an order through its full status sequence", async ({ page }) => {
  await page.goto("/admin/orders");
  await page.getByPlaceholder("Search by customer...").fill(CUSTOMER_NAME);

  const row = rowContaining(page, CUSTOMER_NAME);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "View" }).click();

  // PENDING -> SENDING -> SENT -> DELIVERED: exactly 3 advances, then the
  // button disappears since DELIVERED has no next status. Each click
  // disables the button and relabels it "Updating..." until the PATCH's
  // response is parsed and local state updates — wait for that relabel to
  // clear (not just the network response) before starting the next click,
  // otherwise the next "Next Step" lookup can race the pending re-render.
  for (let i = 0; i < 3; i++) {
    const nextStepButton = page.getByRole("button", { name: "Next Step" });
    await expect(nextStepButton).toBeVisible();
    await nextStepButton.click();
    await expect(page.getByRole("button", { name: "Updating..." })).toHaveCount(0);
  }

  await expect(page.getByRole("button", { name: "Next Step" })).toHaveCount(0);
  await expect(page.getByText("Delivered", { exact: true })).toHaveClass(/text-neutral-900/);

  // Confirm the status change was actually persisted server-side, not just
  // held in local component state.
  await page.reload();
  await expect(page.getByRole("button", { name: "Next Step" })).toHaveCount(0);
  await expect(page.getByText("Delivered", { exact: true })).toHaveClass(/text-neutral-900/);
});
