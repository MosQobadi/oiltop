import { describe, expect, it } from "vitest";
import {
  formatDiscountLabel,
  formatNumber,
  formatToman,
  getDiscountPercent,
  isDiscounted,
} from "./pricing";

describe("formatNumber", () => {
  it("groups thousands in English", () => {
    expect(formatNumber(4850000, "en")).toBe("4,850,000");
  });

  it("uses Persian digits and separator in Farsi", () => {
    expect(formatNumber(4850000, "fa")).toBe("۴٬۸۵۰٬۰۰۰");
  });

  it("rounds away the fractions a percentage discount leaves behind", () => {
    expect(formatNumber(4486250.5, "en")).toBe("4,486,251");
  });
});

describe("formatToman", () => {
  it("appends the currency label in the reader's language", () => {
    expect(formatToman(520000, "en")).toBe("520,000 Toman");
    expect(formatToman(520000, "fa")).toBe("۵۲۰٬۰۰۰ تومان");
  });
});

describe("getDiscountPercent", () => {
  it("returns the whole-percent discount", () => {
    expect(getDiscountPercent(5400000, 4860000)).toBe(10);
  });

  it("returns 0 when the final price is the list price", () => {
    expect(getDiscountPercent(4290000, 4290000)).toBe(0);
  });

  it("returns 0 for a discount too small to render as a percent", () => {
    expect(getDiscountPercent(1000, 997)).toBe(0);
  });

  it("returns 0 rather than a negative percent if finalPrice is somehow higher", () => {
    expect(getDiscountPercent(1000, 1200)).toBe(0);
  });

  it("returns 0 for a free or price-less product instead of dividing by zero", () => {
    expect(getDiscountPercent(0, 0)).toBe(0);
  });
});

describe("isDiscounted", () => {
  it("agrees with getDiscountPercent, so the badge and the strikethrough match", () => {
    expect(isDiscounted(5400000, 4860000)).toBe(true);
    expect(isDiscounted(1000, 997)).toBe(false);
  });
});

describe("formatDiscountLabel", () => {
  it("renders a minus sign and a percent sign per locale", () => {
    expect(formatDiscountLabel(15, "en")).toBe("−15%");
    expect(formatDiscountLabel(15, "fa")).toBe("−۱۵٪");
  });
});
