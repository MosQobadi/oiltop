import type { CartItem } from "@/lib/store/cart";
import type { StorefrontCheckoutFormInput, StorefrontOrderCreateInput } from "@/lib/validation";
import { DELIVERY_COST, type DeliveryMethod } from "./delivery";

// The checkout screen's shared vocabulary: how the form's three address fields
// become the one string an order stores, what the summary adds up to before the
// server has said anything, and the shape of the order that comes back.
//
// Pure, like lib/storefront/cart.ts, so the numbers on the screen can be checked
// without a browser. Nothing here is authoritative about money — every figure a
// customer is actually charged is recomputed in `createStorefrontOrder`; these
// are what the screen shows while they're still deciding.

// Province → city → street, the order an Iranian address is written and read in,
// joined into the single line the schema stores (there is no address book, so
// there is nothing to keep the three parts separate for). The admin's order
// detail renders this string as-is, which is why it's commas rather than
// newlines — that screen doesn't preserve them.
export function composeShippingAddress(values: {
  province: string;
  city: string;
  street: string;
}): string {
  return [values.province, values.city, values.street]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

// The form's values plus the cart, as the API takes them. `addedAt` rides along
// per line because the 24-hour price hold is measured from it (Design Decision
// 8) — it is the one thing the browser tells the server about a price, and the
// worst a stale or edited one can do is fall through to the current price.
export function toOrderPayload(
  values: StorefrontCheckoutFormInput,
  items: CartItem[],
): StorefrontOrderCreateInput {
  return {
    items: items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      addedAt: new Date(item.addedAt),
    })),
    contactName: values.contactName,
    contactPhone: values.contactPhone,
    // No `contactEmail`: the screen doesn't ask for one (design brief), and the
    // API's field is optional. The courier calls the phone number.
    shippingAddress: composeShippingAddress(values),
    postalCode: values.postalCode,
    deliveryMethod: values.deliveryMethod,
  };
}

export interface CheckoutTotals {
  subtotal: number;
  shippingCost: number;
  total: number;
}

// What the summary shows before the order exists. `subtotal` arrives from the
// cart, so it's the sum of the prices captured on add — an estimate, and said to
// be one on screen. The delivery rate is the same constant the server bills, so
// that half of the arithmetic always agrees.
export function checkoutTotals(subtotal: number, deliveryMethod: DeliveryMethod): CheckoutTotals {
  const shippingCost = DELIVERY_COST[deliveryMethod];
  return { subtotal, shippingCost, total: subtotal + shippingCost };
}

// VAT (9%) is included in every price shown and charged, never added on top
// (design brief), so this is a reading of the total rather than a term in it —
// `Order.tax` is stored as 0 for exactly this reason. It's shown because a
// customer is entitled to know how much of what they paid was tax.
export const INCLUDED_VAT_RATE = 0.09;

export function includedVat(total: number): number {
  return Math.round(total - total / (1 + INCLUDED_VAT_RATE));
}

// The order as `POST /api/storefront/orders` returns it — the snapshot the
// confirmation screen renders, and the only thing it renders. Re-reading the
// products afterwards could make a placed order appear to change, so nothing on
// that screen comes from the catalog.
//
// Declared here rather than inferred from `createStorefrontOrder` because this
// is the shape *after* JSON: `createdAt` is a string on this side of the wire.
export interface PlacedOrderItem {
  productId: string;
  /** `productNameSnapshot` — the English name as it stood when the order was placed. */
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** The charged price differs from the one the cart quoted. */
  repriced: boolean;
  previousUnitPrice: number | null;
}

export interface PlacedOrder {
  id: string;
  createdAt: string;
  status: "PENDING";
  paymentStatus: "UNPAID";
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  total: number;
  shippingAddress: string;
  postalCode: string;
  items: PlacedOrderItem[];
}
