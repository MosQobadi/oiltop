import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MAX_CART_QUANTITY } from "@/lib/storefront/cart";

// The cart lives in the browser until checkout — there is no Cart table, so an
// Order is the first time any of this reaches the database.
//
// The store knows what the customer put in the cart and nothing about what the
// catalog says now: stock and price are re-read per line by useCartLines, and
// the reconciliation between the two lives in lib/storefront/cart.ts. So the
// only limit enforceable here is the per-line ceiling — the live one is applied
// where the live numbers are.
export interface CartItem {
  productId: string;
  slug: string;
  nameEn: string;
  nameFa: string | null;
  image: string | null;
  // Unit price in Toman as it was displayed when the item went into the cart,
  // paired with `addedAt`. Advisory only: checkout re-resolves the real price
  // server-side from the price log, so nothing captured here is ever charged.
  price: number;
  addedAt: string;
  quantity: number;
}

export type NewCartItem = Omit<CartItem, "quantity" | "addedAt">;

interface CartState {
  items: CartItem[];
  addItem: (item: NewCartItem, quantity?: number) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

// A quantity that reaches the store is always a whole number between 1 and the
// per-line ceiling — a `<input type="number">` can hand over 2.5 or 1e9, and
// nothing downstream should have to re-check that.
function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_CART_QUANTITY);
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      // Re-adding a product bumps its quantity and keeps the original
      // `addedAt`: the older timestamp is the one that decides whether the
      // captured price still holds at checkout, and quietly refreshing it would
      // extend a price the customer was never promised.
      addItem: (item, quantity = 1) =>
        set((state) => {
          const added = clampQuantity(quantity);
          const existing = state.items.find((line) => line.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((line) =>
                line.productId === item.productId
                  ? { ...line, quantity: clampQuantity(line.quantity + added) }
                  : line,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              { ...item, quantity: added, addedAt: new Date().toISOString() },
            ],
          };
        }),

      // Stepping a line down to zero is how the cart's "−" button removes it.
      // The test is `<= 0` rather than `> 0` so that a junk value (an emptied
      // number input reads as NaN) lands in clampQuantity instead of quietly
      // deleting the line.
      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((line) => line.productId !== productId)
              : state.items.map((line) =>
                  line.productId === productId
                    ? { ...line, quantity: clampQuantity(quantity) }
                    : line,
                ),
        })),

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((line) => line.productId !== productId) })),

      clear: () => set({ items: [] }),
    }),
    { name: "topoil-cart", version: 1 },
  ),
);

// Selector rather than a hook so the store stays free of React/UI imports —
// the header badge pairs it with a hydration guard, since a localStorage cart
// has no value to render during SSR.
export const selectCartItemCount = (state: CartState): number =>
  state.items.reduce((total, line) => total + line.quantity, 0);

// An estimate, and labelled as one wherever it's rendered: it adds up the prices
// captured on add, and the only authority on what the customer actually pays is
// the server's recompute at checkout (Task 8.2 / Design Decision 8). Shipping
// and the informational VAT line aren't part of it.
export const selectCartSubtotal = (state: CartState): number =>
  state.items.reduce((total, line) => total + line.price * line.quantity, 0);
