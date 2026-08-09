import { describe, expect, it } from "vitest";
import { FIT_PARAM, formatEngineOptionLabel, withFitContext } from "./fitment";

describe("withFitContext", () => {
  it("starts a query string when the href has none", () => {
    expect(withFitContext("/en/fitment", "eng_1")).toBe("/en/fitment?fit=eng_1");
  });

  it("appends to an href that already carries params", () => {
    expect(withFitContext("/en/products?page=2", "eng_1")).toBe("/en/products?page=2&fit=eng_1");
  });

  it("encodes the id rather than trusting it to be URL-safe", () => {
    expect(withFitContext("/en/fitment", "a b&c")).toBe("/en/fitment?fit=a%20b%26c");
  });

  it("uses the exported param name, so readers and writers can't drift", () => {
    expect(withFitContext("/en/fitment", "eng_1")).toContain(`${FIT_PARAM}=`);
  });
});

describe("formatEngineOptionLabel", () => {
  const engine = {
    labelEn: "1.4L TU3 Petrol",
    labelFa: "۱٫۴ لیتر TU3 بنزینی",
    yearStart: 2001,
    yearEnd: 2010,
  };

  it("pairs the engine label with its year range", () => {
    expect(formatEngineOptionLabel("en", engine)).toBe("1.4L TU3 Petrol (2001–2010)");
  });

  it("renders the Persian label and Persian digits on the fa tree", () => {
    expect(formatEngineOptionLabel("fa", engine)).toBe("۱٫۴ لیتر TU3 بنزینی (۲۰۰۱–۲۰۱۰)");
  });

  it("reads a null yearEnd as still in production, not as unknown", () => {
    expect(formatEngineOptionLabel("en", { ...engine, yearEnd: null })).toBe(
      "1.4L TU3 Petrol (2001–Present)",
    );
    expect(formatEngineOptionLabel("fa", { ...engine, yearEnd: null })).toContain("تاکنون");
  });

  it("falls back to the English label when the Persian one is blank", () => {
    expect(formatEngineOptionLabel("fa", { ...engine, labelFa: "  " })).toBe(
      "1.4L TU3 Petrol (۲۰۰۱–۲۰۱۰)",
    );
  });
});
