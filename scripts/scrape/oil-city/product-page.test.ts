import { describe, expect, it } from "vitest";
import {
  isPlaceholderDescription,
  normaliseDigits,
  parseProductPage,
  parseToman,
  sourceSlugFrom,
} from "./product-page";

const URL = "https://www.oil-city.ir/product/bosch-quadra-20w50-3-5l/";

interface PageParts {
  name?: string;
  current?: string;
  old?: string;
  categorySlug?: string;
  categoryText?: string;
  meta?: string;
  desc?: string;
  images?: string;
  /** Markup appended after the product block, standing in for related products. */
  after?: string;
}

/** Mirrors the real page's shape closely enough to exercise every selector. */
function page(parts: PageParts = {}): string {
  const {
    name = "روغن موتور بوش مدل کوادرا SL حجم 3.5 لیتر (20w-50)",
    current = "2,999,000  تومان",
    old = "3,500,000  تومان",
    categorySlug = "engine-oil",
    categoryText = "روغن موتور خودرو",
    meta = `<span>برند : <a href="/brand/bosch/">بوش</a></span>
            <span>درجه گرانروی : <a href="/sae/20w50/">20w50</a></span>`,
    desc = "یک توضیح واقعی درباره این محصول.",
    images = `<img src="https://www.oil-city.ir/wp-content/uploads/2020/10/bosch.jpg">`,
    after = "",
  } = parts;

  return `<html><body>
    <div class="breadcrumbs_area"><div class="breadcrumb_content">
      <a class="bread-link bread-home" href="/">فروشگاه</a>
      <a class="bread-tax bread-custom-tax" href="/product-category/products/">محصولات</a>
      <a class="bread-tax bread-custom-tax" href="/product-category/products/${categorySlug}/">${categoryText}</a>
      <span>${name}</span>
    </div></div>
    <div class="product_details"><div class="row"><div class="col-lg-6">
      <div class="product_d_right">
        <h1 class="h3">${name}</h1>
        <div class="product_d_meta">${meta}</div>
        <div class="price_box">
          <span class="text-success current_price">${current}</span>
          ${old === "" ? "" : `<small class="text-danger old_price"><del>${old}</del></small>`}
          قیمت و موجودی بروز میباشد
        </div>
      </div>
      ${images}
    </div></div>
    <div class="tab-pane" id="DESC">${desc}</div>
    ${after}
    </div>
  </body></html>`;
}

describe("normaliseDigits", () => {
  it("converts Persian and Arabic-Indic digits to ASCII", () => {
    expect(normaliseDigits("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    expect(normaliseDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
  });

  it("leaves everything else alone", () => {
    expect(normaliseDigits("5W-30 تومان")).toBe("5W-30 تومان");
  });
});

describe("parseToman", () => {
  it("reads a comma-grouped price", () => {
    expect(parseToman("2,999,000  تومان")).toBe(2_999_000);
  });

  it("reads a price written in Persian digits", () => {
    expect(parseToman("۲٬۹۹۹٬۰۰۰ تومان")).toBe(2_999_000);
  });

  it("returns null rather than zero when there is no number", () => {
    // "Out of stock" is an absence of a price, not a price of nothing — and a
    // zero here would import as a free product.
    expect(parseToman("ناموجود")).toBeNull();
    expect(parseToman("")).toBeNull();
    expect(parseToman(null)).toBeNull();
  });
});

describe("sourceSlugFrom", () => {
  it("decodes a percent-encoded Persian slug", () => {
    expect(sourceSlugFrom("https://www.oil-city.ir/product/%da%af%d8%b1%db%8c%d8%b3/")).toBe(
      "گریس",
    );
  });

  it("keeps a Latin slug as-is", () => {
    expect(sourceSlugFrom(URL)).toBe("bosch-quadra-20w50-3-5l");
  });
});

describe("isPlaceholderDescription", () => {
  const name = "گریس کلسیوم آداک 2 پوندی";

  it("treats the theme's two fallbacks as no description", () => {
    expect(isPlaceholderDescription(name, name)).toBe(true);
    expect(isPlaceholderDescription(`قیمت و خرید ${name}`, name)).toBe(true);
    expect(isPlaceholderDescription("", name)).toBe(true);
  });

  it("passes a real description through", () => {
    expect(isPlaceholderDescription("این روغن برای موتورهای بنزینی مناسب است.", name)).toBe(false);
  });
});

describe("parseProductPage", () => {
  it("reads a discounted, in-stock product", () => {
    const { product, problems } = parseProductPage(page(), URL);

    expect(problems).toEqual([]);
    expect(product).not.toBeNull();
    expect(product?.priceToman).toBe(2_999_000);
    expect(product?.originalPriceToman).toBe(3_500_000);
    expect(product?.stockRawText).toBeNull();
    expect(product?.categoryGuess).toBe("engine-oil");
    expect(product?.sourceCategoryText).toBe("روغن موتور خودرو");
    expect(product?.brandLabelFa).toBe("بوش");
    expect(product?.specs).toEqual({ برند: "بوش", "درجه گرانروی": "20w50" });
    expect(product?.sourceSlug).toBe("bosch-quadra-20w50-3-5l");
  });

  it("reads an out-of-stock product as having no price at all", () => {
    const { product } = parseProductPage(page({ current: "ناموجود", old: "" }), URL);

    expect(product?.priceToman).toBeNull();
    expect(product?.originalPriceToman).toBeNull();
    expect(product?.stockRawText).toBe("ناموجود");
    // Still recorded verbatim, so the reviewer can see what the page said.
    expect(product?.priceRawText).toContain("ناموجود");
  });

  // G.1 found 63 of the first 200 products saying this. It is a price state, not
  // a parse failure, and filing it as a problem buried the real ones.
  it("reads call-for-price as a stock state, not a problem", () => {
    const { product, problems } = parseProductPage(page({ current: "تماس بگیرید", old: "" }), URL);

    expect(problems).toEqual([]);
    expect(product?.priceToman).toBeNull();
    expect(product?.stockRawText).toBe("تماس بگیرید");
  });

  it("records no original price when nothing is struck through", () => {
    const { product } = parseProductPage(page({ old: "" }), URL);
    expect(product?.priceToman).toBe(2_999_000);
    expect(product?.originalPriceToman).toBeNull();
  });

  // The single most damaging thing this parser could do: related products lower
  // down the page carry their own .price_box, so an unscoped lookup would price
  // every product at whatever its neighbour costs.
  it("ignores the prices of related products further down the page", () => {
    const related = `<div class="card single_product products">
        <div class="price_box"><span class="current_price">1,149,000 تومان</span>
        <small class="old_price">1,549,000 تومان</small></div>
      </div>`;
    const { product } = parseProductPage(page({ after: related }), URL);

    expect(product?.priceToman).toBe(2_999_000);
    expect(product?.originalPriceToman).toBe(3_500_000);
  });

  it("guesses a category only on an exact slug match", () => {
    // Their heavy-truck filters are not our car part, however alike the slugs
    // look. A null keeps the source's own wording and loses nothing.
    const heavy = parseProductPage(
      page({ categorySlug: "oil-filter-heavy", categoryText: "فیلتر روغن سنگین" }),
      URL,
    );
    expect(heavy.product?.categoryGuess).toBeNull();
    expect(heavy.product?.sourceCategoryText).toBe("فیلتر روغن سنگین");

    const ours = parseProductPage(
      page({ categorySlug: "oil-filter", categoryText: "فیلتر روغن" }),
      URL,
    );
    expect(ours.product?.categoryGuess).toBe("oil-filter");
  });

  it("never fills oemPartNumbers, because the source has none", () => {
    // The JSON-LD's `mpn` is the WordPress post id. Reading it would invent
    // part numbers that no page on the site actually states.
    const { product } = parseProductPage(page(), URL);
    expect(product?.oemPartNumbers).toEqual([]);
  });

  it("keeps real images and drops the theme's", () => {
    const images = [
      `<img src="data:image/png;base64,AAAA">`,
      `<img src="https://www.oil-city.ir/wp-content/themes/oil-city/assets/img/icon/Snapp-Pay.svg">`,
      `<img src="https://www.oil-city.ir/wp-content/themes/oil-city/assets/img/product/default-product.jpg">`,
      `<img src="https://www.oil-city.ir/wp-content/uploads/2020/10/real.jpg">`,
    ].join("");
    const { product } = parseProductPage(page({ images }), URL);

    expect(product?.imageUrls).toEqual([
      "https://www.oil-city.ir/wp-content/uploads/2020/10/real.jpg",
    ]);
  });

  it("unwraps the resizer to the underlying image", () => {
    const inner = "https://www.oil-city.ir/wp-content/uploads/2020/12/greese-val.jpg";
    const images = `<img src="https://www.oil-city.ir/wp-content/themes/oil-city/inc/functions/nepso-timthumb.php?w=500&amp;h=500&amp;src=${inner}">`;
    const { product } = parseProductPage(page({ images }), URL);

    expect(product?.imageUrls).toEqual([inner]);
  });

  it("reports an unrecognised layout instead of improvising", () => {
    const { product, problems } = parseProductPage("<html><body><h1>nope</h1></body></html>", URL);

    expect(product).toBeNull();
    expect(problems[0]).toContain("product_d_right");
  });

  it("reports price text that is neither a price nor a known state", () => {
    // Genuinely unknown wording, not one of the states the site is known to use.
    const { problems } = parseProductPage(page({ current: "به زودی", old: "" }), URL);
    expect(problems.some((issue) => issue.includes("unrecognised price"))).toBe(true);
  });
});
