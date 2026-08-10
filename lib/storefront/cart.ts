import type { StorefrontCartProduct } from "@/lib/services/catalog";
import type { CartItem } from "@/lib/store/cart";

// The cart's shared vocabulary: how large one line may get, and how the snapshot
// the browser stored when the customer hit "add" reconciles with what the
// catalog says about that product now.
//
// Everything here is pure, so the store, the cart page and the lookup route can
// all lean on the same rules without any one of them owning them. Both type
// imports above are type-only on purpose — nothing in this file drags Prisma
// into the client bundle or zustand into a route handler.

// A line is capped at 99 rather than at "whatever's in the warehouse": it keeps
// a stray key-repeat out of the store, and it's the ceiling the lookup route
// clamps its published stock figure to (see StorefrontCartProduct.maxQuantity).
export const MAX_CART_QUANTITY = 99;

export interface CartLine {
  item: CartItem;
  /**
   * The product as the catalog reads it now, or null if it's no longer
   * purchasable at all — deactivated, or moved under a deactivated category or
   * brand. Also null while a line is still `pending` (see below), which is why
   * every flag has its own field instead of being derived at the call site.
   */
  live: StorefrontCartProduct | null;
  /** The largest quantity this line may be raised to right now. */
  maxQuantity: number;
  unavailable: boolean;
  outOfStock: boolean;
  /** Stored quantity is above what's left — the customer has to trim it. */
  exceedsStock: boolean;
  /** Captured price no longer matches the catalog's; checkout decides which wins. */
  priceChanged: boolean;
}

// Prices are whole Toman, but finalPrice is a float (`price * (1 - d/100)`), so
// "changed" is a half-Toman threshold rather than `!==` — a discount that
// round-trips through binary floating point must not read as a price change.
const PRICE_EPSILON = 0.5;

// A line whose live data hasn't come back yet. Unknown is not the same as
// broken: every flag stays false so the cart page doesn't flash "no longer
// available" against its own items on first paint.
export function pendingCartLine(item: CartItem): CartLine {
  return {
    item,
    live: null,
    maxQuantity: MAX_CART_QUANTITY,
    unavailable: false,
    outOfStock: false,
    exceedsStock: false,
    priceChanged: false,
  };
}

export function buildCartLines(items: CartItem[], products: StorefrontCartProduct[]): CartLine[] {
  const byId = new Map(products.map((product) => [product.productId, product]));

  return items.map((item) => {
    const live = byId.get(item.productId);
    if (!live) {
      return { ...pendingCartLine(item), maxQuantity: 0, unavailable: true };
    }

    const outOfStock = live.stockStatus === "OUT_OF_STOCK";
    return {
      item,
      live,
      maxQuantity: live.maxQuantity,
      unavailable: false,
      outOfStock,
      // Out of stock already says "you can't order this"; reporting the
      // quantity as too high on top of it is the same news twice.
      exceedsStock: !outOfStock && item.quantity > live.maxQuantity,
      priceChanged: Math.abs(live.finalPrice - item.price) >= PRICE_EPSILON,
    };
  });
}

/** Why checkout is refused — one reason, in the order they're worth saying. */
export type CartBlockingReason = "unavailable" | "outOfStock" | "exceedsStock";

// What stops "Proceed to checkout" (Task 6.2). A changed price deliberately
// isn't in here: per Design Decision 8 the server re-resolves every price at
// checkout anyway, so the cart only has to mention it, not block on it.
//
// One reason rather than all of them, because the summary has one line to say
// it in and each line already carries its own warning. The order is by how
// final the problem is: an unavailable product can only be removed, an
// out-of-stock one may come back, and an over-stock quantity is a number the
// customer can just lower.
export function cartBlockingReason(lines: CartLine[]): CartBlockingReason | null {
  if (lines.some((line) => line.unavailable)) return "unavailable";
  if (lines.some((line) => line.outOfStock)) return "outOfStock";
  if (lines.some((line) => line.exceedsStock)) return "exceedsStock";
  return null;
}

export function cartHasBlockingIssue(lines: CartLine[]): boolean {
  return cartBlockingReason(lines) !== null;
}
