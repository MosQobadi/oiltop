"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsHydrated } from "@heroui/react";
import type { StorefrontCartProduct } from "@/lib/services/catalog";
import {
  buildCartLines,
  cartHasBlockingIssue,
  pendingCartLine,
  type CartLine,
} from "@/lib/storefront/cart";
import { selectCartSubtotal, useCartStore, type CartItem } from "@/lib/store/cart";

// The cart page's data layer, kept out of the page the same way useFitmentWizard
// is kept out of FitmentWizard: the store holds what the customer added, this
// re-reads what the catalog says about it now, and the page renders the two
// merged.
//
// The lookup is keyed on the set of product ids, so changing a quantity doesn't
// re-fetch — quantities aren't something the server has an opinion about until
// checkout.

interface LoadedProducts {
  key: string;
  products: StorefrontCartProduct[];
}

const NOT_LOADED: LoadedProducts = { key: "", products: [] };
const NO_ITEMS: CartItem[] = [];

export interface CartLinesState {
  lines: CartLine[];
  /** Sum of the captured prices — an estimate, not the charged total. */
  subtotal: number;
  itemCount: number;
  loading: boolean;
  /** The lookup failed; `lines` carry no live data, and `retry` re-runs it. */
  failed: boolean;
  /**
   * Live data is in hand for exactly these lines. Until it is, every line's
   * flags read false, so a page can render the cart immediately and only
   * commit to a warning once there's something to warn about.
   */
  refreshed: boolean;
  canCheckout: boolean;
  setQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  retry: () => void;
}

export function useCartLines(): CartLinesState {
  // The cart is localStorage-only, so on the server (and on the first client
  // pass, which has to match it) there is nothing to render but an empty cart.
  const isHydrated = useIsHydrated();
  const storedItems = useCartStore((state) => state.items);
  const storedSubtotal = useCartStore(selectCartSubtotal);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  // Both the answer and a failure are recorded against the cart they belong to,
  // which is what lets `loading` be derived instead of tracked: having ids, no
  // data for them and no failure against them *is* a request in flight. Nothing
  // here sets state synchronously inside the effect.
  const [loaded, setLoaded] = useState<LoadedProducts>(NOT_LOADED);
  const [failedKey, setFailedKey] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const items = isHydrated ? storedItems : NO_ITEMS;
  // Sorted so that reordering the same products — which the store never does
  // today, but a future "move to end" would — isn't a reason to re-fetch.
  const idsKey = useMemo(
    () =>
      items
        .map((item) => item.productId)
        .sort()
        .join(","),
    [items],
  );

  useEffect(() => {
    if (idsKey === "") return;

    let stale = false;
    void (async () => {
      try {
        const response = await fetch(`/api/storefront/cart?ids=${encodeURIComponent(idsKey)}`);
        const result = await response.json();
        if (stale) return;

        if (!result?.success) {
          setFailedKey(idsKey);
          return;
        }
        setLoaded({ key: idsKey, products: result.data.products as StorefrontCartProduct[] });
      } catch {
        if (!stale) setFailedKey(idsKey);
      }
    })();

    return () => {
      stale = true;
    };
  }, [idsKey, reloadToken]);

  // Options loaded for a different cart read as not loaded at all — the same
  // "does this answer match the question" staleness check the fitment wizard
  // uses, and what keeps a removed line's data from lingering.
  const refreshed = idsKey !== "" && loaded.key === idsKey;
  const failed = idsKey !== "" && failedKey === idsKey;
  const loading = idsKey !== "" && !refreshed && !failed;

  const lines = useMemo(
    () => (refreshed ? buildCartLines(items, loaded.products) : items.map(pendingCartLine)),
    [items, loaded.products, refreshed],
  );

  // Raising a line beyond what's left is simply not offered: the stepper's cap
  // is this clamp, so the only way to hold an over-stock quantity is to have
  // stored it before the stock dropped — which `exceedsStock` flags instead.
  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const line = lines.find((candidate) => candidate.item.productId === productId);
      updateQuantity(productId, line ? Math.min(quantity, line.maxQuantity) : quantity);
    },
    [lines, updateQuantity],
  );

  // Clearing the recorded failure is what puts the cart back into `loading`;
  // the token is what makes the effect run again for an unchanged id list.
  const retry = useCallback(() => {
    setFailedKey("");
    setReloadToken((token) => token + 1);
  }, []);

  return {
    lines,
    subtotal: isHydrated ? storedSubtotal : 0,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    loading,
    failed,
    refreshed,
    // Checking out on unverified lines is exactly the order Task 8.2 would
    // reject, so an unrefreshed cart can't proceed either.
    canCheckout: refreshed && lines.length > 0 && !cartHasBlockingIssue(lines),
    setQuantity,
    removeItem,
    retry,
  };
}
