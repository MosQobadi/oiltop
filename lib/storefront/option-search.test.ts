import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeForSearch } from "./option-search";

describe("normalizeForSearch", () => {
  it("folds Arabic yeh and kaf onto their Persian forms", () => {
    // The same word, typed on an Arabic layout and stored from Persian data.
    expect(normalizeForSearch("كيا")).toBe(normalizeForSearch("کیا"));
  });

  it("folds alef and hamza forms", () => {
    expect(normalizeForSearch("آئودی")).toBe(normalizeForSearch("اىودي"));
  });

  it("drops the zero-width non-joiner Persian compounds carry", () => {
    expect(normalizeForSearch("بی‌ام‌و")).toBe("بیامو");
  });

  it("converts Persian and Arabic digits to ASCII", () => {
    expect(normalizeForSearch("۲۰۶")).toBe("206");
    expect(normalizeForSearch("٢٠٦")).toBe("206");
  });

  it("lowercases Latin and collapses whitespace", () => {
    expect(normalizeForSearch("  Mobil   1 ")).toBe(" mobil 1 ");
  });
});

describe("matchesSearch", () => {
  it("matches a Persian name typed with Arabic letters", () => {
    expect(matchesSearch("کیا", "كيا")).toBe(true);
  });

  it("matches case-insensitively across Latin", () => {
    expect(matchesSearch("Peugeot", "peu")).toBe(true);
  });

  it("matches either language when both are searchable", () => {
    const searchText = "پژو Peugeot";
    expect(matchesSearch(searchText, "peugeot")).toBe(true);
    expect(matchesSearch(searchText, "پژو")).toBe(true);
  });

  it("requires every token, in any order", () => {
    expect(matchesSearch("Peugeot 206", "206 peugeot")).toBe(true);
    expect(matchesSearch("Peugeot 206", "peugeot 207")).toBe(false);
  });

  it("matches a Persian year typed in either digit set", () => {
    expect(matchesSearch("۱۳۹۵", "1395")).toBe(true);
  });

  it("treats an empty or whitespace query as matching everything", () => {
    expect(matchesSearch("anything", "")).toBe(true);
    expect(matchesSearch("anything", "   ")).toBe(true);
  });

  it("does not match an unrelated name", () => {
    expect(matchesSearch("Castrol", "کیا")).toBe(false);
  });
});
