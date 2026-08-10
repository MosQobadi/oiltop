import { describe, expect, it } from "vitest";
import { contains, searchTokens } from "./search";

describe("searchTokens", () => {
  it("returns no tokens for an absent or blank search", () => {
    expect(searchTokens(undefined)).toEqual([]);
    expect(searchTokens("")).toEqual([]);
    expect(searchTokens("   ")).toEqual([]);
  });

  it("splits on whitespace and drops the gaps", () => {
    expect(searchTokens("Sara Ahmadi")).toEqual(["Sara", "Ahmadi"]);
    expect(searchTokens("  Mobil   1  5W-30 ")).toEqual(["Mobil", "1", "5W-30"]);
    expect(searchTokens("Peugeot\t206\n1.4L")).toEqual(["Peugeot", "206", "1.4L"]);
  });

  it("leaves a single-word search as one token, so behavior is unchanged", () => {
    expect(searchTokens("Ahmadi")).toEqual(["Ahmadi"]);
  });
});

describe("contains", () => {
  it("builds a case-insensitive substring filter", () => {
    expect(contains("Sara")).toEqual({ contains: "Sara", mode: "insensitive" });
  });
});
