import { describe, expect, it } from "vitest";
import {
  buildCartLines,
  cartBlockingReason,
  cartHasBlockingIssue,
  isPriceHoldActive,
  pendingCartLine,
  PRICE_HOLD_MS,
} from "./cart";
import type { StorefrontCartProduct } from "@/lib/services/catalog";
import type { CartItem } from "@/lib/store/cart";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "prod_1",
    slug: "mobil-1-esp-5w30",
    nameEn: "Mobil 1 ESP 5W-30",
    nameFa: "موبیل ۱",
    image: null,
    price: 4_850_000,
    addedAt: "2026-08-01T10:00:00.000Z",
    quantity: 2,
    ...overrides,
  };
}

function live(overrides: Partial<StorefrontCartProduct> = {}): StorefrontCartProduct {
  return {
    productId: "prod_1",
    slug: "mobil-1-esp-5w30",
    nameEn: "Mobil 1 ESP 5W-30",
    nameFa: "موبیل ۱",
    image: null,
    price: 4_850_000,
    finalPrice: 4_850_000,
    stockStatus: null,
    maxQuantity: 99,
    ...overrides,
  };
}

describe("buildCartLines", () => {
  it("keeps the stored order and attaches each line's live data", () => {
    const lines = buildCartLines(
      [item(), item({ productId: "prod_2" })],
      [live({ productId: "prod_2" }), live()],
    );

    expect(lines.map((line) => line.item.productId)).toEqual(["prod_1", "prod_2"]);
    expect(lines[0]!.live?.productId).toBe("prod_1");
    expect(lines.every((line) => !line.unavailable)).toBe(true);
  });

  it("flags a product the catalog no longer returns as unavailable, with no room to order", () => {
    const [line] = buildCartLines([item()], []);

    expect(line).toMatchObject({ unavailable: true, live: null, maxQuantity: 0 });
  });

  it("flags an out-of-stock line without also calling its quantity too high", () => {
    const [line] = buildCartLines(
      [item({ quantity: 3 })],
      [live({ stockStatus: "OUT_OF_STOCK", maxQuantity: 0 })],
    );

    expect(line).toMatchObject({ outOfStock: true, exceedsStock: false, maxQuantity: 0 });
  });

  it("flags a stored quantity above what's left, and not one that still fits", () => {
    const [tooMany] = buildCartLines(
      [item({ quantity: 5 })],
      [live({ stockStatus: "LOW_STOCK", maxQuantity: 3 })],
    );
    expect(tooMany).toMatchObject({ exceedsStock: true, maxQuantity: 3 });

    const [exactly] = buildCartLines(
      [item({ quantity: 3 })],
      [live({ stockStatus: "LOW_STOCK", maxQuantity: 3 })],
    );
    expect(exactly!.exceedsStock).toBe(false);
  });

  it("flags a price that moved since the item was added, in either direction", () => {
    const [risen] = buildCartLines([item({ price: 4_850_000 })], [live({ finalPrice: 5_100_000 })]);
    expect(risen!.priceChanged).toBe(true);

    const [fallen] = buildCartLines(
      [item({ price: 4_850_000 })],
      [live({ finalPrice: 4_600_000 })],
    );
    expect(fallen!.priceChanged).toBe(true);
  });

  it("does not read floating-point noise in a discounted price as a change", () => {
    // What the PDP captured and what the service recomputes are the same
    // expression, but a fraction of a Toman apart is still not a price change.
    const captured = 1_999_999 * (1 - 15 / 100);
    const [line] = buildCartLines(
      [item({ price: captured })],
      [live({ finalPrice: captured + 0.0000001 })],
    );

    expect(line!.priceChanged).toBe(false);
  });
});

describe("pendingCartLine", () => {
  it("reads as unknown rather than broken until live data arrives", () => {
    expect(pendingCartLine(item())).toMatchObject({
      live: null,
      unavailable: false,
      outOfStock: false,
      exceedsStock: false,
      priceChanged: false,
    });
  });
});

describe("cartHasBlockingIssue", () => {
  it("blocks on an unavailable, out-of-stock, or over-stock line", () => {
    expect(cartHasBlockingIssue(buildCartLines([item()], []))).toBe(true);
    expect(
      cartHasBlockingIssue(
        buildCartLines([item()], [live({ stockStatus: "OUT_OF_STOCK", maxQuantity: 0 })]),
      ),
    ).toBe(true);
    expect(
      cartHasBlockingIssue(buildCartLines([item({ quantity: 9 })], [live({ maxQuantity: 4 })])),
    ).toBe(true);
  });

  it("does not block on a changed price — checkout re-resolves it server-side", () => {
    expect(cartHasBlockingIssue(buildCartLines([item()], [live({ finalPrice: 5_500_000 })]))).toBe(
      false,
    );
  });

  it("is false for a healthy cart and for an empty one", () => {
    expect(cartHasBlockingIssue(buildCartLines([item()], [live()]))).toBe(false);
    expect(cartHasBlockingIssue([])).toBe(false);
  });
});

describe("cartBlockingReason", () => {
  it("names the reason so the summary can say it in one line", () => {
    expect(cartBlockingReason(buildCartLines([item()], []))).toBe("unavailable");
    expect(
      cartBlockingReason(
        buildCartLines([item()], [live({ stockStatus: "OUT_OF_STOCK", maxQuantity: 0 })]),
      ),
    ).toBe("outOfStock");
    expect(
      cartBlockingReason(buildCartLines([item({ quantity: 9 })], [live({ maxQuantity: 4 })])),
    ).toBe("exceedsStock");
  });

  it("reports the most final problem first when a cart has several", () => {
    const lines = buildCartLines(
      [
        item({ productId: "prod_3", quantity: 9 }),
        item({ productId: "prod_2" }),
        item({ productId: "prod_1" }),
      ],
      [
        live({ productId: "prod_3", maxQuantity: 4 }),
        live({ productId: "prod_2", stockStatus: "OUT_OF_STOCK", maxQuantity: 0 }),
      ],
    );

    expect(cartBlockingReason(lines)).toBe("unavailable");
  });

  it("is null for a healthy cart, a re-priced one, and an empty one", () => {
    expect(cartBlockingReason(buildCartLines([item()], [live()]))).toBeNull();
    expect(
      cartBlockingReason(buildCartLines([item()], [live({ finalPrice: 5_500_000 })])),
    ).toBeNull();
    expect(cartBlockingReason([])).toBeNull();
  });
});

describe("isPriceHoldActive", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("holds a price for 24 hours from when the line was added", () => {
    expect(isPriceHoldActive(now, now)).toBe(true);
    expect(isPriceHoldActive(ago(60 * 60 * 1000), now)).toBe(true);
    expect(isPriceHoldActive(ago(PRICE_HOLD_MS), now)).toBe(true);
  });

  it("lets the hold lapse a moment past the window", () => {
    expect(isPriceHoldActive(ago(PRICE_HOLD_MS + 1), now)).toBe(false);
    expect(isPriceHoldActive(ago(48 * 60 * 60 * 1000), now)).toBe(false);
  });

  it("gives no hold at all to a timestamp from the future", () => {
    expect(isPriceHoldActive(new Date(now.getTime() + 1000), now)).toBe(false);
  });
});
