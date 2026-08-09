"use client";

import Link from "next/link";
import { useIsHydrated } from "@heroui/react";
import { CartIcon } from "./icons";
import { CART_PATH, navHref } from "./nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { selectCartItemCount, useCartStore } from "@/lib/store/cart";

export function CartLink({ locale, className = "" }: { locale: Locale; className?: string }) {
  // The cart only exists in localStorage, so the server has no count to render.
  // Showing 0 until hydration keeps the first client pass identical to the SSR
  // HTML instead of tripping a mismatch on every page load.
  const isHydrated = useIsHydrated();
  const storedCount = useCartStore(selectCartItemCount);
  const count = isHydrated ? storedCount : 0;

  const label = pickLocale(locale, "Cart", "سبد خرید");

  return (
    <Link
      href={navHref(locale, CART_PATH)}
      aria-label={count > 0 ? `${label} (${count})` : label}
      data-testid="cart-link"
      className={`focus-visible:ring-accent hover:border-accent hover:text-accent inline-flex min-h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${className}`}
    >
      <CartIcon className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
      {count > 0 && (
        <span
          data-testid="cart-count"
          className="bg-accent inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold text-white"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
