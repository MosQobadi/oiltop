import { test, expect } from "@playwright/test";
import { rowContaining } from "./support/table";

// Seeded as PENDING (prisma/seed.ts) — the only seeded order for this
// customer, so searching by name resolves to exactly one row.
const CUSTOMER_NAME = "Sara Ahmadi";
// Searched separately from the displayed name: the Orders query matches
// `contains` against firstName / lastName / email individually, so a full name
// matches no registered customer. A surname is the narrowest term that hits.
const CUSTOMER_SEARCH = "Ahmadi";

test("advance an order through its full status sequence", async ({ page }) => {
  await page.goto("/admin/orders");
  await page.getByPlaceholder("Search by customer...").fill(CUSTOMER_SEARCH);

  // The search box debounces 300ms and then refetches, so the unfiltered rows
  // are still on screen right after `fill`. Matching one of those and clicking
  // it races the refetch, which detaches the row mid-click. Waiting for the
  // list to narrow to the single match is what proves the refetch has landed.
  await expect(page.getByRole("button", { name: "View" })).toHaveCount(1);

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

// Seeded with no customer account (Design Decision 6), so the Customer column
// falls back to the name checkout collected and tags the row.
const GUEST_NAME = "Kaveh Sadeghi";

test("shows a guest order under its own name, tagged Guest", async ({ page }) => {
  await page.goto("/admin/orders");
  await page.getByPlaceholder("Search by customer...").fill(GUEST_NAME);
  await expect(page.getByRole("button", { name: "View" })).toHaveCount(1);

  // Not `rowContaining` — that matches a cell's full text exactly, and this
  // cell renders the name and the "Guest" tag as adjacent spans.
  const row = page
    .locator('[role="gridcell"], [role="rowheader"]')
    .filter({ hasText: new RegExp(`^${GUEST_NAME}\\s*Guest$`) })
    .locator("..");
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "View" }).click();

  await expect(page.getByText(GUEST_NAME)).toBeVisible();
  await expect(page.getByText("Checked out without an account")).toBeVisible();
  await expect(page.getByText("+989123334455")).toBeVisible();
});
