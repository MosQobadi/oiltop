import { test, expect } from "@playwright/test";

// Starts logged out — every other spec reuses the authenticated storageState
// from global-setup.ts, but this one exists specifically to exercise the
// login UI itself.
test.use({ storageState: { cookies: [], origins: [] } });

test("admin can log in and reach the dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email", { exact: true }).fill("admin@topoil.com");
  await page.getByLabel("Password", { exact: true }).fill("Admin123!");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText("Recent Orders")).toBeVisible();
});
