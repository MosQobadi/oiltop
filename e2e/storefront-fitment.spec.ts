import { test, expect } from "@playwright/test";
import {
  ADMIN_STORAGE_STATE,
  expectResolvedCar,
  fillCarFinder,
  fitmentSection,
  SIGNED_OUT,
} from "./support/storefront";
import { rowContaining } from "./support/table";

// The headline feature, end to end: a customer who knows their car and nothing
// else gets a set of parts for it, and the one category we can't sell them yet
// becomes a lead instead of a dead end.
//
// The three cars below are chosen for what the seed makes them prove, not for
// variety (see prisma/seed.ts):
//
//   Peugeot 206  — one engine, so the Engine step auto-skips; its profile is
//                  the `specOnly` plan, so Engine Oil has no catalog match
//                  while all four filters do. That is the "real product and a
//                  spec-only fallback side by side" case in one result set.
//   Hyundai Tucson — two engines whose year ranges *overlap* (both 2016–2021),
//                  the only seeded model where a year leaves a real choice, so
//                  the Engine step has to render.
//   Its petrol engine runs the `dual` plan — a HOT/COLD pair of oils.

test.use(SIGNED_OUT);

test("auto-skips the Engine step and shows a real product beside a spec-only fallback", async ({
  page,
}) => {
  await page.goto("/en/fitment");

  await fillCarFinder(page, { brandSlug: "peugeot", model: "206", year: 2005 });

  // One matching engine is not a choice, so the wizard resolves on the year and
  // the fourth step is never rendered.
  await expect(page.getByTestId("fitment-step-engine")).toHaveCount(0);
  await expectResolvedCar(page, "Peugeot 206");
  await expect(page.getByText("1.4L TU3 Petrol (2000–2010)")).toBeVisible();

  // The catalog carries no oil for this engine — the spec is known, the product
  // isn't. This is a designed answer, not an error state.
  const oilSection = fitmentSection(page, "ENGINE_OIL");
  const specOnlyCard = oilSection.getByTestId("fitment-spec-only-card");
  await expect(specOnlyCard).toBeVisible();
  await expect(specOnlyCard).toContainText("Spec known — no exact match yet");
  await expect(specOnlyCard).toContainText("5W-30 or 10W-40");
  await expect(oilSection.getByTestId("product-card")).toHaveCount(0);

  // …while the filters resolve to real, buyable products, on the same screen.
  const filterSections = fitmentSection(page, "FILTER");
  await expect(filterSections).toHaveCount(4);
  await expect(filterSections.getByTestId("product-card")).toHaveCount(4);
  await expect(filterSections.getByTestId("fitment-spec-only-card")).toHaveCount(0);

  // "Side by side" is the point: both shapes are on screen at once, not one
  // after a reload.
  await expect(specOnlyCard).toBeInViewport({ ratio: 0 });
  await expect(page.getByTestId("product-card").first()).toBeVisible();
});

test("keeps the Engine step when a year matches more than one engine", async ({ page }) => {
  await page.goto("/en/fitment");

  // Both Tucson engines were sold 2016–2021, so the year can't disambiguate.
  await fillCarFinder(page, { brandSlug: "hyundai", model: "Tucson", year: 2018 });

  const engineStep = page.getByTestId("fitment-step-engine");
  await expect(engineStep).toBeVisible();

  const engineSelect = page.getByLabel("Engine", { exact: true });
  // Three options: the placeholder plus the two real engines.
  await expect(engineSelect.locator("option")).toHaveCount(3);
  await expect(engineSelect).toContainText("2.0L Nu Petrol (2016–2021)");
  await expect(engineSelect).toContainText("2.0L CRDi Diesel (2016–2021)");

  // Nothing has resolved yet — picking the engine is what does it.
  await expect(page).not.toHaveURL(/[?&]fit=/);

  await engineSelect.selectOption({ label: "2.0L Nu Petrol (2016–2021)" });
  await expectResolvedCar(page, "Hyundai Tucson");

  // This engine's profile approves two oil grades, so Engine Oil is a HOT/COLD
  // pair of columns rather than a single recommendation.
  const oilSection = fitmentSection(page, "ENGINE_OIL");
  await expect(oilSection.getByTestId("fitment-climate-column")).toHaveCount(2);
  await expect(
    oilSection.locator('[data-testid="fitment-climate-column"][data-climate="HOT"]'),
  ).toContainText("Mobil 1 0W-40");
  await expect(
    oilSection.locator('[data-testid="fitment-climate-column"][data-climate="COLD"]'),
  ).toContainText("Castrol Edge 0W-20");
});

// A name this run owns, so the admin-side lookup can't land on a seeded inquiry
// (prisma/seed.ts already files one against this same Peugeot 206).
const REQUESTER_NAME = `E2E Requester ${Date.now()}`;
const REQUESTER_PHONE = "+989120009988";

test("turns a spec-only result into a Fitment Inquiry the admin can see", async ({
  page,
  browser,
}) => {
  await page.goto("/en/fitment");
  await fillCarFinder(page, { brandSlug: "peugeot", model: "206", year: 2005 });
  await expectResolvedCar(page, "Peugeot 206");

  const specOnlyCard = fitmentSection(page, "ENGINE_OIL").getByTestId("fitment-spec-only-card");
  await specOnlyCard.getByRole("button", { name: "We don't carry this yet — Request it" }).click();

  const form = specOnlyCard.getByTestId("request-it-form");
  await form.getByLabel("Your name", { exact: true }).fill(REQUESTER_NAME);
  await form.getByLabel("Phone", { exact: true }).fill(REQUESTER_PHONE);

  // The message arrives pre-filled with the spec the customer is asking for —
  // that context is the whole value of the lead, so check it before sending.
  // `toHaveValue`, not `toContainText`: a textarea's content is its value, and
  // its text content is the (empty) markup it was rendered with.
  await expect(form.getByLabel("What you need (optional)", { exact: true })).toHaveValue(
    /Peugeot 206/,
  );

  await form.getByRole("button", { name: "Send request" }).click();

  // The confirmation replaces the form in place and stays there.
  await expect(specOnlyCard.getByText("We got it — our team will reach out.")).toBeVisible();
  await expect(specOnlyCard.getByTestId("request-it-form")).toHaveCount(0);

  // Spot-check the admin side in its own context: this window is a signed-out
  // shopper, and signing it in would throw away the state under test.
  const adminContext = await browser.newContext({ storageState: ADMIN_STORAGE_STATE });
  const adminPage = await adminContext.newPage();

  try {
    await adminPage.goto("/admin/inquiries");
    await adminPage.getByPlaceholder("Search by name, phone, or email...").fill(REQUESTER_NAME);

    // The search debounces before refetching, so the unfiltered rows are still
    // on screen right after `fill` — waiting for the list to narrow to one row
    // is what proves the refetch landed (same reason as e2e/orders.spec.ts).
    await expect(adminPage.getByRole("button", { name: "View" })).toHaveCount(1);

    const row = rowContaining(adminPage, REQUESTER_NAME);
    await expect(row).toBeVisible();
    await expect(row).toContainText("New");

    await row.getByRole("button", { name: "View" }).click();
    await expect(adminPage.getByRole("heading", { name: REQUESTER_NAME, level: 1 })).toBeVisible();
    await expect(adminPage.getByText(REQUESTER_PHONE)).toBeVisible();
    // The car and the category the customer was looking at when they asked —
    // without these the lead is just a phone number. The car reads as one
    // composed label here (`carEngineLabel` in server/fitmentInquiry.ts).
    await expect(adminPage.getByText("Peugeot 206 1.4L TU3 Petrol (2000–2010)")).toBeVisible();
    await expect(adminPage.getByText("Engine Oil", { exact: true })).toBeVisible();
  } finally {
    await adminContext.close();
  }
});
