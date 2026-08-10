import { describe, expect, it } from "vitest";
import {
  accountReturnPath,
  isNavItemActive,
  isProtectedAccountPath,
  navHref,
} from "./nav-items";

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

describe("isProtectedAccountPath", () => {
  it("protects an account screen and anything nested under it", () => {
    expect(isProtectedAccountPath("/orders")).toBe(true);
    expect(isProtectedAccountPath("/orders/ord_123")).toBe(true);
  });

  it("leaves the public auth screens open", () => {
    expect(isProtectedAccountPath("/login")).toBe(false);
    expect(isProtectedAccountPath("/register")).toBe(false);
  });

  it("does not protect a route that merely shares a prefix", () => {
    expect(isProtectedAccountPath("/orders-help")).toBe(false);
  });

  it("leaves the rest of the storefront open", () => {
    expect(isProtectedAccountPath("")).toBe(false);
    expect(isProtectedAccountPath("/products")).toBe(false);
  });
});

describe("accountReturnPath", () => {
  it("returns the guard's path when it is inside this locale's tree", () => {
    expect(accountReturnPath("/en/orders/ord_123", "en")).toBe("/en/orders/ord_123");
  });

  it("keeps a query string on the way back", () => {
    expect(accountReturnPath("/fa/orders?page=2", "fa")).toBe("/fa/orders?page=2");
  });

  it("falls back to the orders screen when there is no from param", () => {
    expect(accountReturnPath(null, "en")).toBe("/en/orders");
    expect(accountReturnPath(undefined, "fa")).toBe("/fa/orders");
    expect(accountReturnPath("", "en")).toBe("/en/orders");
  });

  it("refuses anything outside this locale's storefront tree", () => {
    expect(accountReturnPath("https://evil.example/en/orders", "en")).toBe("/en/orders");
    expect(accountReturnPath("//evil.example", "en")).toBe("/en/orders");
    expect(accountReturnPath("/admin/dashboard", "en")).toBe("/en/orders");
    expect(accountReturnPath("/fa/orders", "en")).toBe("/en/orders");
    // The bare locale root is not a path *inside* the tree, so it falls back
    // rather than dropping the customer on the homepage after signing in.
    expect(accountReturnPath("/en", "en")).toBe("/en/orders");
  });

  it("refuses the auth screens themselves, which would bounce back to this form", () => {
    expect(accountReturnPath("/en/login", "en")).toBe("/en/orders");
    expect(accountReturnPath("/en/register?from=%2Fen%2Forders", "en")).toBe("/en/orders");
  });
});
