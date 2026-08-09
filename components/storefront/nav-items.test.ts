import { describe, expect, it } from "vitest";
import { isNavItemActive, navHref } from "./nav-items";

describe("navHref", () => {
  it("prefixes the locale segment", () => {
    expect(navHref("en", "/products")).toBe("/en/products");
    expect(navHref("fa", "/products")).toBe("/fa/products");
  });

  it("renders the home path as the bare locale root", () => {
    expect(navHref("en", "")).toBe("/en");
  });
});

describe("isNavItemActive", () => {
  it("matches a section's own URL", () => {
    expect(isNavItemActive("/en/products", "en", "/products")).toBe(true);
  });

  it("matches anything nested under a section", () => {
    expect(isNavItemActive("/fa/products/mobil-1-5w30", "fa", "/products")).toBe(true);
  });

  it("does not match a sibling section that shares a prefix", () => {
    expect(isNavItemActive("/en/products-archive", "en", "/products")).toBe(false);
  });

  it("does not match the other locale's tree", () => {
    expect(isNavItemActive("/fa/products", "en", "/products")).toBe(false);
  });

  it("matches home only exactly, since every path is nested under it", () => {
    expect(isNavItemActive("/en", "en", "")).toBe(true);
    expect(isNavItemActive("/en/", "en", "")).toBe(true);
    expect(isNavItemActive("/en/products", "en", "")).toBe(false);
  });
});
