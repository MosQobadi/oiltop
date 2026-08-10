"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { NotifyMeForm } from "../NotifyMeForm";
import { CART_PATH, navHref } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { MAX_CART_QUANTITY } from "@/lib/storefront/cart";
import { useCartStore, type NewCartItem } from "@/lib/store/cart";

// The PDP's buy control. `ProductCard` adds one of a thing in a single tap
// because that's all a grid tile has room to ask; the product page is where a
// customer decides they want four, so this is the same store write with a
// quantity in front of it.
//
// Out of stock isn't a disabled button: it swaps in `NotifyMeForm` outright
// (Design Decision 9), without the card's toggle — the page has the room, and a
// customer who came all the way here has already shown the interest the toggle
// was there to ask about.

export interface AddToCartControlProps {
  locale: Locale;
  product: NewCartItem;
  outOfStock: boolean;
  className?: string;
}

// The PDP knows a product is in stock, not by how much — the cart is where a
// line meets the live figure (useCartLines), so the only cap this screen can
// apply is the store's own per-line ceiling.
const STEPPER_BUTTON_CLASS =
  "focus-visible:ring-accent inline-flex size-11 shrink-0 items-center justify-center rounded-[9px] text-[17px] leading-none text-neutral-600 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none disabled:text-neutral-300 disabled:hover:bg-transparent";

export function AddToCartControl({
  locale,
  product,
  outOfStock,
  className = "",
}: AddToCartControlProps) {
  const quantityId = useId();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  if (outOfStock) {
    return (
      <div className={className}>
        <p className="text-[13.5px] text-neutral-600">
          {pickLocale(
            locale,
            "Out of stock right now. Leave a contact and we'll tell you the moment it's back.",
            "در حال حاضر ناموجود است. راه تماستان را بگذارید تا به‌محض موجود شدن خبرتان کنیم.",
          )}
        </p>
        <NotifyMeForm locale={locale} productRef={product.slug} className="mt-3 max-w-sm" />
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem(product, quantity);
    setAdded(true);
  };

  // Any change to the quantity retires the confirmation: it named an amount
  // that is no longer the one the button would add.
  const changeQuantity = (next: number) => {
    setQuantity(Math.min(Math.max(next, 1), MAX_CART_QUANTITY));
    setAdded(false);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-[11px] border border-neutral-200 bg-white p-1">
          <button
            type="button"
            onClick={() => changeQuantity(quantity - 1)}
            disabled={quantity <= 1}
            aria-label={pickLocale(locale, "Decrease quantity", "کاهش تعداد")}
            className={STEPPER_BUTTON_CLASS}
          >
            <span aria-hidden="true">−</span>
          </button>

          {/* A real number input, not a label around two buttons: entering "12"
              beats twelve taps, and it's what a keyboard user expects here. */}
          <label htmlFor={quantityId} className="sr-only">
            {pickLocale(locale, "Quantity", "تعداد")}
          </label>
          <input
            id={quantityId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CART_QUANTITY}
            value={quantity}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              changeQuantity(Number.isNaN(next) ? 1 : next);
            }}
            className="focus-visible:ring-accent w-12 [appearance:textfield] rounded-[7px] border-0 bg-transparent py-2 text-center text-[14px] font-medium text-neutral-900 focus-visible:ring-2 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />

          <button
            type="button"
            onClick={() => changeQuantity(quantity + 1)}
            disabled={quantity >= MAX_CART_QUANTITY}
            aria-label={pickLocale(locale, "Increase quantity", "افزایش تعداد")}
            className={STEPPER_BUTTON_CLASS}
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          data-testid="pdp-add-to-cart"
          className="focus-visible:ring-accent bg-accent min-h-11 flex-1 rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {pickLocale(locale, "Add to cart", "افزودن به سبد")}
        </button>
      </div>

      {added && (
        <p role="status" className="mt-3 text-[13px] text-neutral-600">
          {pickLocale(locale, "Added to your cart.", "به سبد خرید اضافه شد.")}{" "}
          <Link
            href={navHref(locale, CART_PATH)}
            className="focus-visible:ring-accent text-accent rounded font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "View cart", "مشاهده‌ی سبد")}
          </Link>
        </p>
      )}
    </div>
  );
}
