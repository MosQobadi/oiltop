import { create } from "zustand";
import { persist } from "zustand/middleware";

// The cart lives in the browser until checkout — there is no Cart table, so an
// Order is the first time any of this reaches the database.
//
// Task 2.1 only needs the header badge to have something real to count, so this
// is the store's shape and its mutators, nothing more. The cart page's subtotal
// and its "this line's price/stock changed since you added it" checks belong on
// top of this, not instead of it.
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
          const existing = state.items.find((line) => line.productId === item.productId);
          if (existing) {
            return {
              items: state.items.map((line) =>
                line.productId === item.productId
                  ? { ...line, quantity: line.quantity + quantity }
                  : line,
              ),
            };
          }
          return {
            items: [...state.items, { ...item, quantity, addedAt: new Date().toISOString() }],
          };
        }),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items:
            quantity > 0
              ? state.items.map((line) =>
                  line.productId === productId ? { ...line, quantity } : line,
                )
              : state.items.filter((line) => line.productId !== productId),
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
