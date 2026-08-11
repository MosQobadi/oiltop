import { describe, expect, it } from "vitest";
import {
  activeProductFilterCount,
  buildProductListHref,
  clearProductFilters,
  collapseSearchParams,
  paginationRange,
  parseProductSort,
  productCountLabel,
  productPageCount,
  productSortLabel,
} from "./plp";

describe("buildProductListHref", () => {
  it("returns the bare path when nothing is filtered", () => {
    expect(buildProductListHref("/en/products", {})).toBe("/en/products");
  });

  it("leaves defaults out, so one view is only ever one URL", () => {
    expect(buildProductListHref("/en/products", { sort: "newest", page: 1 })).toBe("/en/products");
  });

  it("writes params in a fixed order regardless of the object's key order", () => {
    const href = buildProductListHref("/fa/products", {
      page: 3,
      brand: "mobil",
      category: "engine-oil",
    });
    expect(href).toBe("/fa/products?category=engine-oil&brand=mobil&page=3");
  });

  it("carries the car context without letting it filter anything", () => {
    expect(buildProductListHref("/en/products", { fit: "eng_1" })).toBe("/en/products?fit=eng_1");
  });

  it("encodes values rather than trusting them to be URL-safe", () => {
    expect(buildProductListHref("/en/products", { search: "5W-30 & filter" })).toBe(
      "/en/products?search=5W-30+%26+filter",
    );
  });

  it("keeps a non-default sort", () => {
    expect(buildProductListHref("/en/products", { sort: "price-asc" })).toBe(
      "/en/products?sort=price-asc",
    );
  });
});

describe("clearProductFilters", () => {
  it("drops the filters but keeps the sort and the car", () => {
    expect(
      clearProductFilters({
        category: "engine-oil",
        brand: "mobil",
        search: "x",
        sort: "price-desc",
        page: 4,
        fit: "eng_1",
      }),
    ).toEqual({ sort: "price-desc", fit: "eng_1" });
  });
});

describe("activeProductFilterCount", () => {
  it("counts only filters — not sort, page or car context", () => {
    expect(activeProductFilterCount({ sort: "price-asc", page: 2, fit: "eng_1" })).toBe(0);
    expect(activeProductFilterCount({ category: "engine-oil", search: "mobil" })).toBe(2);
  });
});

describe("collapseSearchParams", () => {
  it("takes the first value of a repeated key", () => {
    expect(collapseSearchParams({ brand: ["mobil", "shell"] })).toEqual({ brand: "mobil" });
  });

  it("treats a present-but-empty param as absent", () => {
    expect(collapseSearchParams({ brand: "", search: "   ", category: "oil" })).toEqual({
      category: "oil",
    });
  });

  it("drops undefined values", () => {
    expect(collapseSearchParams({ brand: undefined })).toEqual({});
  });
});

describe("parsers", () => {
  it("falls back to the default sort rather than undefined", () => {
    expect(parseProductSort("price-desc")).toBe("price-desc");
    expect(parseProductSort("cheapest")).toBe("newest");
  });
});

describe("labels", () => {
  it("renders enum values in the reader's language", () => {
    expect(productSortLabel("en", "price-asc")).toBe("Price: low to high");
    expect(productSortLabel("fa", "price-asc")).toBe("قیمت: کم به زیاد");
  });

  it("counts products in the reader's digits, and singular only in English", () => {
    expect(productCountLabel("en", 1)).toBe("1 product");
    expect(productCountLabel("en", 12)).toBe("12 products");
    expect(productCountLabel("fa", 12)).toBe("۱۲ محصول");
  });
});

describe("productPageCount", () => {
  it("has no pages at all when nothing matched", () => {
    expect(productPageCount(0, 20)).toBe(0);
  });

  it("rounds a partial last page up", () => {
    expect(productPageCount(21, 20)).toBe(2);
    expect(productPageCount(40, 20)).toBe(2);
  });
});

describe("paginationRange", () => {
  it("is empty when there is nothing to page through", () => {
    expect(paginationRange(1, 0)).toEqual([]);
  });

  it("lists every page while they still fit", () => {
    expect(paginationRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("elides the middle but always keeps both ends reachable", () => {
    expect(paginationRange(7, 20)).toEqual([1, "gap", 6, 7, 8, "gap", 20]);
  });

  it("gaps only where more than one page was skipped", () => {
    expect(paginationRange(3, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
    // A single skipped page costs the same width as the gap would, so it stays.
    expect(paginationRange(4, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("clamps a page beyond the end instead of inventing numbers", () => {
    expect(paginationRange(99, 4)).toEqual([1, 2, 3, 4]);
  });
});
