import type { Locator, Page } from "@playwright/test";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * DataTable rows compute their ARIA accessible name from the first column
 * only (the one marked isRowHeader) — e.g. on Categories/Brands/Products/Car
 * Brands/Car Models/Car Engines/Orders that's the Image or Order ID column,
 * so `getByRole("row", { name })` can't find a row by its product/customer
 * name unless that happens to be the first column. Locating the specific
 * cell instead and walking up to its row works regardless of column order.
 */
export function rowContaining(page: Page, text: string): Locator {
  return page
    .locator('[role="gridcell"], [role="rowheader"]')
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) })
    .locator("..");
}
