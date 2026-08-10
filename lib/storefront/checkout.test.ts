import { describe, expect, it } from "vitest";
import type { CartItem } from "@/lib/store/cart";
import type { StorefrontCheckoutFormInput } from "@/lib/validation";
import { checkoutTotals, composeShippingAddress, includedVat, toOrderPayload } from "./checkout";
import { DELIVERY_COST } from "./delivery";

function formValues(
  overrides: Partial<StorefrontCheckoutFormInput> = {},
): StorefrontCheckoutFormInput {
  return {
    contactName: "Sara Ahmadi",
    contactPhone: "09121234567",
    province: "Tehran",
    city: "Tehran",
    street: "Sattari Expressway, No. 128, Unit 4",
    postalCode: "1478833614",
    deliveryMethod: "nationwide",
    ...overrides,
  };
}

function cartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "prod_1",
    slug: "mobil-1-5w30",
    nameEn: "Mobil 1 5W-30",
    nameFa: null,
    image: null,
    price: 5_120_000,
    addedAt: "2026-08-10T09:00:00.000Z",
    quantity: 2,
    ...overrides,
  };
}

describe("composeShippingAddress", () => {
  it("writes the address province → city → street", () => {
    expect(
      composeShippingAddress({ province: "Tehran", city: "Karaj", street: "Beheshti St, No. 5" }),
    ).toBe("Tehran, Karaj, Beheshti St, No. 5");
  });

  it("trims each part rather than carrying the form's whitespace into the order", () => {
    expect(
      composeShippingAddress({ province: " Fars ", city: " Shiraz ", street: " Zand St " }),
    ).toBe("Fars, Shiraz, Zand St");
  });

  // The schema requires all three, so this can't arrive from the form — it's
  // here so a blank never shows up as a stray ", ," in a courier's address.
  it("drops an empty part instead of leaving an empty segment", () => {
    expect(composeShippingAddress({ province: "Tehran", city: "", street: "Valiasr St" })).toBe(
      "Tehran, Valiasr St",
    );
  });
});

describe("toOrderPayload", () => {
  it("sends quantities and addedAt per line, and no prices at all", () => {
    const payload = toOrderPayload(formValues(), [cartItem(), cartItem({ productId: "prod_2" })]);

    expect(payload.items).toEqual([
      { productId: "prod_1", quantity: 2, addedAt: new Date("2026-08-10T09:00:00.000Z") },
      { productId: "prod_2", quantity: 2, addedAt: new Date("2026-08-10T09:00:00.000Z") },
    ]);
    // Every price is resolved server-side; there is nothing here to tamper with.
    expect(JSON.stringify(payload)).not.toContain("5120000");
  });

  it("folds the three address fields into the one string the order stores", () => {
    const payload = toOrderPayload(formValues(), [cartItem()]);

    expect(payload.shippingAddress).toBe("Tehran, Tehran, Sattari Expressway, No. 128, Unit 4");
    expect(payload.postalCode).toBe("1478833614");
    expect(payload.contactEmail).toBeUndefined();
  });
});

describe("checkoutTotals", () => {
  it("adds the delivery rate the server bills to the cart's estimate", () => {
    expect(checkoutTotals(10_240_000, "nationwide")).toEqual({
      subtotal: 10_240_000,
      shippingCost: DELIVERY_COST.nationwide,
      total: 10_240_000 + DELIVERY_COST.nationwide,
    });
  });

  it("re-prices when the delivery method changes", () => {
    expect(checkoutTotals(1_000_000, "tehran-same-day").total).toBe(
      1_000_000 + DELIVERY_COST["tehran-same-day"],
    );
  });
});

describe("includedVat", () => {
  // Included, not added: the 9% is already inside the total, so it's total −
  // total/1.09 rather than total × 0.09.
  it("reads the tax out of a VAT-inclusive total", () => {
    expect(includedVat(1_090_000)).toBe(90_000);
  });

  it("rounds to whole Toman", () => {
    expect(Number.isInteger(includedVat(5_310_000))).toBe(true);
  });

  it("is zero for a zero total", () => {
    expect(includedVat(0)).toBe(0);
  });
});
