import type { Locator, Page } from "@playwright/test";

/**
 * BilingualTextField/BilingualTextareaField render each field's outer label
 * as a plain <span>, not a <label for>, so getByLabel only ever resolves the
 * "English"/"فارسی" sub-labels — never the field's own name (e.g. "Name").
 * Fields appear in a fixed, known order on every form in this app, so the
 * n-th occurrence (0-indexed, in the order the bilingual fields appear
 * before any collapsed "SEO" disclosure) reliably identifies each one.
 */
export function bilingualEn(page: Page, index: number): Locator {
  return page.getByLabel("English", { exact: true }).nth(index);
}

export function bilingualFa(page: Page, index: number): Locator {
  return page.getByLabel("فارسی", { exact: true }).nth(index);
}

export async function fillBilingual(
  page: Page,
  index: number,
  en: string,
  fa: string,
) {
  await bilingualEn(page, index).fill(en);
  await bilingualFa(page, index).fill(fa);
}

/** Opens a HeroUI SelectField by its label and picks the option with this exact text. */
export async function selectOption(page: Page, label: string, optionText: string) {
  await page.getByLabel(label, { exact: true }).first().click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

/**
 * Types into a searchable ComboBox (e.g. ProductSelectField) and waits for
 * the debounced fetch it triggers before picking a result — the field's
 * options only exist after that request resolves.
 */
export async function searchAndPick(
  page: Page,
  label: string,
  query: string,
  optionText: string,
  waitForUrlSubstring: string,
) {
  const input = page.getByLabel(label, { exact: true }).first();
  await input.click();
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes(waitForUrlSubstring) && res.status() === 200,
  );
  await input.fill(query);
  await responsePromise;
  await page.getByRole("option", { name: optionText, exact: true }).click();
}
