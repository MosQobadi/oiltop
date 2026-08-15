import { test, expect, type Page } from "@playwright/test";
import { ADMIN_STORAGE_STATE, chooseFromMenu, SIGNED_OUT } from "./support/storefront";
import { rowContaining } from "./support/table";

// The buying path: browse → filter → PDP → cart → checkout → the order exists
// in the two places it has to exist.
//
// It runs twice, because "where a placed order shows up" has two answers and
// only one of them is a guest's. A guest order has no owner, so it can never
// appear in the storefront's order history — that's Design Decision 6, spelled
// out in app/[locale]/(account)/orders/page.tsx, and the guest's receipt is the
// checkout confirmation instead. So the guest run checks the confirmation and
// the admin Orders screen, and a second run signs a real customer in to check
// the order history the guest run can't reach.
//
// Note both runs POST /api/storefront/orders, which is rate-limited to 10 per
// IP per hour and holds that bucket in memory for the dev server's lifetime.
// With `reuseExistingServer` a local server kept alive across ~5 repeat runs
// will start returning 429 — restart it, don't chase the failure.

const PRODUCT_NAME = "Castrol Magnatec 5W-40";
const UNIT_PRICE_TOMAN = "1,100,000";

/** Filters the PLP down to one brand's engine oils and opens a known product. */
async function browseToProduct(page: Page) {
  await page.goto("/en/products");
  await expect(page.getByTestId("product-grid")).toBeVisible();

  // Every seeded product, before anything is narrowed.
  const allProducts = await page.getByTestId("product-card").count();
  expect(allProducts).toBeGreaterThan(2);

  // The rail writes the next URL and lets the server re-render the grid, so a
  // filtered view is a navigation — waiting on the URL is waiting on the grid.
  await chooseFromMenu(page, "filter-category", "Engine Oil");
  await expect(page).toHaveURL(/category=engine-oil/);
  await chooseFromMenu(page, "filter-brand", "Castrol");
  await expect(page).toHaveURL(/brand=castrol/);

  // Castrol seeds exactly two engine oils, so the filter did something.
  await expect(page.getByTestId("product-card")).toHaveCount(2);
  await expect(page.getByTestId("product-grid")).toContainText(PRODUCT_NAME);

  await page.getByRole("link", { name: PRODUCT_NAME, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/products\/[^/?]+$/);
  await expect(page.getByRole("heading", { name: PRODUCT_NAME, level: 1 })).toBeVisible();
}

/** Adds `quantity` of the open PDP's product, then lands on the cart. */
async function addToCartAndOpenCart(page: Page, quantity: number) {
  for (let added = 1; added < quantity; added++) {
    await page.getByRole("button", { name: "Increase quantity" }).click();
  }
  await page.getByTestId("pdp-add-to-cart").click();
  await expect(page.getByText("Added to your cart.")).toBeVisible();

  await page.goto("/en/cart");
  const lines = page.getByTestId("cart-line");
  await expect(lines).toHaveCount(1);
  await expect(lines.first()).toContainText(PRODUCT_NAME);

  // No discount on this product, so the subtotal is a plain multiple — enough
  // to prove the captured price and the quantity both survived the hop.
  await expect(page.getByTestId("cart-subtotal")).toContainText(
    (1_100_000 * quantity).toLocaleString("en-US"),
  );

  // Enabled only once the cart has re-read live availability (`useCartLines`).
  const checkout = page.getByTestId("cart-checkout");
  await expect(checkout).toBeEnabled();
  await checkout.click();
  await expect(page).toHaveURL(/\/en\/checkout$/);
}

async function fillCheckout(page: Page, contact: { name: string; phone: string }) {
  await expect(page.getByTestId("checkout-form")).toBeVisible();
  await page.getByLabel("Recipient name", { exact: true }).fill(contact.name);
  await page.getByLabel("Mobile number", { exact: true }).fill(contact.phone);
  await page.getByLabel("Postal code", { exact: true }).fill("1415673111");
  await page.getByLabel("Province", { exact: true }).fill("Tehran");
  await page.getByLabel("City", { exact: true }).fill("Tehran");
  await page
    .getByLabel("Full address", { exact: true })
    .fill("No. 12, Valiasr Street, Unit 3, near the park");
}

/** Places the order and returns the order number from the receipt. */
async function placeOrder(page: Page): Promise<string> {
  const placeOrderButton = page.getByTestId("place-order");
  await expect(placeOrderButton).toBeEnabled();
  await placeOrderButton.click();

  await expect(page).toHaveURL(/\/en\/checkout\/confirmation$/);
  await expect(page.getByTestId("order-confirmation")).toBeVisible();

  const orderNumber = (await page.getByTestId("order-number").innerText()).trim();
  // `#` plus the last 8 characters of the cuid, upper-cased (lib/orders.ts) —
  // the one key the confirmation, the order history and the admin list share.
  expect(orderNumber).toMatch(/^#[0-9A-Z]{8}$/);

  return orderNumber;
}

test.describe("guest checkout", () => {
  test.use(SIGNED_OUT);

  // Unique per run so the admin lookup can't land on the seeded guest order.
  const GUEST_NAME = `E2E Guest ${Date.now()}`;
  const GUEST_PHONE = "+989121110022";

  test("browses, filters, buys as a guest, and the order reaches admin Orders", async ({
    page,
    browser,
  }) => {
    await browseToProduct(page);
    await addToCartAndOpenCart(page, 2);
    await fillCheckout(page, { name: GUEST_NAME, phone: GUEST_PHONE });

    const orderNumber = await placeOrder(page);

    // The receipt is the guest's only copy of the order, so it has to be right.
    await expect(page.getByTestId("confirmation-line")).toHaveCount(1);
    await expect(page.getByTestId("confirmation-line")).toContainText(PRODUCT_NAME);
    await expect(page.getByTestId("confirmation-line")).toContainText(UNIT_PRICE_TOMAN);
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();

    // A guest order deliberately has no home in the storefront's order history:
    // with no owner there is nothing to check a session against, so the account
    // area bounces a signed-out visitor to the login form instead.
    await page.goto("/en/orders");
    await expect(page).toHaveURL(/\/en\/login\?from=/);

    // The admin side is where a guest order does show up.
    const adminContext = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
    const adminPage = await adminContext.newPage();

    try {
      await adminPage.goto("/admin/orders");
      await adminPage.getByPlaceholder("Search by customer...").fill(GUEST_NAME);
      // The search debounces before refetching; narrowing to one row is what
      // proves the refetch landed (same reason as e2e/orders.spec.ts).
      await expect(adminPage.getByRole("button", { name: "View" })).toHaveCount(1);

      const row = rowContaining(adminPage, orderNumber);
      await expect(row).toBeVisible();
      await expect(row).toContainText("Pending");

      await row.getByRole("button", { name: "View" }).click();
      await expect(adminPage.getByText(orderNumber)).toBeVisible();
      await expect(adminPage.getByText(GUEST_NAME).first()).toBeVisible();
      await expect(adminPage.getByText("Checked out without an account")).toBeVisible();
      await expect(adminPage.getByText(GUEST_PHONE)).toBeVisible();
      await expect(adminPage.getByText(PRODUCT_NAME).first()).toBeVisible();
    } finally {
      await adminContext.close();
    }
  });
});

test.describe("signed-in checkout", () => {
  test.use(SIGNED_OUT);

  // Seeded CUSTOMER with exactly one existing order (prisma/seed.ts), and not
  // the one e2e/orders.spec.ts advances — so this run's history is predictable.
  const CUSTOMER_EMAIL = "niloofar.karimi@example.com";
  const CUSTOMER_PASSWORD = "Customer123!";

  test("shows a signed-in customer's order in their storefront order history", async ({ page }) => {
    await page.goto("/en/login");
    await page.getByLabel("Mobile number or email", { exact: true }).fill(CUSTOMER_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(CUSTOMER_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    // Signing in lands on the order history — the seeded order proves the
    // session took before anything is added to a cart.
    await expect(page).toHaveURL(/\/en\/orders$/);
    await expect(page.getByTestId("order-row")).toHaveCount(1);

    await browseToProduct(page);
    await addToCartAndOpenCart(page, 1);
    await fillCheckout(page, { name: "Niloofar Karimi", phone: "+989173334455" });

    const orderNumber = await placeOrder(page);

    await page.goto("/en/orders");
    const rows = page.getByTestId("order-row");
    await expect(rows).toHaveCount(2);

    // Newest first, so the order just placed heads the list.
    const newRow = rows.first();
    await expect(newRow).toContainText(orderNumber);
    await expect(newRow).toContainText("1 item");
    await expect(newRow).toContainText("Pending");
    await expect(newRow).toContainText("Unpaid");
  });
});
