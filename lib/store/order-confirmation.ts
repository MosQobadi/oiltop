import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PlacedOrder } from "@/lib/storefront/checkout";

// The order that was just placed, handed from the checkout screen to the
// confirmation screen. It is the API's own response and nothing else — the
// confirmation shows the snapshot, so re-reading the products (or the order)
// afterwards can't make a placed order appear to change.
//
// `sessionStorage`, not `localStorage`: a reload of the confirmation page has to
// keep working — a guest has no order history to fall back on — but the receipt
// must not still be sitting there for whoever opens the browser next. It also
// keeps two tabs mid-checkout from overwriting each other's result.
interface OrderConfirmationState {
  order: PlacedOrder | null;
  setOrder: (order: PlacedOrder) => void;
  clear: () => void;
}

export const useOrderConfirmationStore = create<OrderConfirmationState>()(
  persist(
    (set) => ({
      order: null,
      setOrder: (order) => set({ order }),
      clear: () => set({ order: null }),
    }),
    {
      name: "topoil-last-order",
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
