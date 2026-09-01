"use client";

import { useState, type ReactNode } from "react";
import { useIsHydrated } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";
import { OilBottleIcon } from "./icons";
import { NotifyMeForm } from "./NotifyMeForm";
import { navHref } from "./nav-items";
import { PriceDisplay } from "./PriceDisplay";
import { StockBadge, type StockBadgeStatus } from "./StockBadge";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { useCartStore, type NewCartItem } from "@/lib/store/cart";
import { MAX_CART_QUANTITY } from "@/lib/storefront/cart";
import { formatDiscountLabel, getDiscountPercent } from "@/lib/storefront/pricing";

// A picture in its own panel, and the words underneath it on the card's own
// white ground.
//
// This replaces the overlay card, where the photograph was the whole tile and a
// dark scrim carried white text across its bottom third. The scrim worked as
// typography and failed as merchandising: it covered the bottom of every bottle
// and filter box — the half with the label on it — and it forced a tall card
// (400px, 444px in the fitment grid) purely so a product still showed above the
// words. Contained artwork with the text below reads at any card height, so the
// card is now as tall as its content and the picture is capped rather than
// cropped.
//
// Product photography is shot on white (see CLAUDE.md), which is what makes the
// panel white rather than tinted: a contained shot never fills its box, and on a
// grey ground those empty bands frame the product as a pasted-in white rectangle
// instead of letting it sit on the card.

// The card renders whatever the caller hands it — this is deliberately a plain
// shape rather than the API's `StorefrontProductCard`, so a fitment result, a
// best-sellers rail and the PLP can all feed the same component without first
// agreeing on a payload.
export interface ProductCardProduct {
  id: string;
  slug: string;
  nameEn: string;
  nameFa: string;
  image: string | null;
  /** List price, before any discount. */
  price: number;
  /** What the customer actually pays. */
  finalPrice: number;
  stockStatus: StockBadgeStatus;
  brand?: { nameEn: string; nameFa: string } | null;
}

export interface ProductCardProps {
  locale: Locale;
  product: ProductCardProduct;
  /** Defaults to the product's PDP under the current locale. */
  href?: string;
  /** "Fits your car" slot — rendered over the image's trailing corner. */
  fitsRibbon?: ReactNode;
  /**
   * Overrides the default "add to the client cart store" behaviour. Left unset,
   * the card is fully serializable, so a Server Component can render a grid of
   * them without a client wrapper.
   */
  onAddToCart?: (product: ProductCardProduct) => void;
  /** `sizes` for the product image; the default matches the PLP grid. */
  imageSizes?: string;
  /** Appended to the card's own classes — layout only. */
  className?: string;
}

const DEFAULT_IMAGE_SIZES = "(min-width: 1024px) 240px, (min-width: 640px) 33vw, 45vw";

// A hairline rather than no frame at all: these grids sit on a white page, so
// without an edge a card is only as visible as the artwork inside it. The lift
// on hover is what says "clickable" — the whole tile is the link.
const CARD_CLASS =
  "group relative flex h-full flex-col rounded-2xl border border-neutral-200/80 bg-white p-2.5 transition-shadow sm:p-3 duration-200 hover:shadow-[0_12px_32px_-20px_rgb(15_23_42/0.55)] focus-within:shadow-[0_12px_32px_-20px_rgb(15_23_42/0.55)]";

// A ratio and a ceiling, and the ceiling is the part that matters. The same card
// is used at 176px wide in the deals rail and at ~370px in the fitment results;
// on a ratio alone the fitment card's picture grew with its column and pushed
// the name, the price and the button off the first screen. Below ~250px of card
// the ratio applies, above it the picture stops growing and the extra width
// becomes white margin around the product — which, on a white-background shot,
// is invisible.
//
// Both numbers tighten on a phone. A picture is the tallest thing on the card
// and a phone is where card height costs the most: the 3:2 box gives back ~14px
// on a two-up grid, and the lower ceiling ~40px on any card wide enough to hit
// it. The product is shot on white and drawn `contain`, so what shrinks is
// mostly the margin around it.
const IMAGE_BOX_CLASS =
  "relative w-full aspect-[3/2] max-h-[150px] overflow-hidden rounded-xl sm:aspect-[4/3] sm:max-h-[190px]";

// The name is a fixed two lines (2 × 19px on a phone, 2 × 21px above): product
// names here run from
// "فیلتر هوا دنسو" to a full spec string, and letting that set the card's height
// leaves every row a different size with the prices off any shared baseline. The
// full name is one click away on the product page.
const NAME_BLOCK_CLASS = "h-[38px] sm:h-[42px]";

// A missing image is still the norm for a catalog mid-import, so the placeholder
// is a designed state rather than a broken-image icon: a hatched slot on a soft
// wash, light enough to recede in a grid where most tiles look like this. The
// hatch is listed first because layers paint front-to-back.
const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-200) 0 1px, transparent 1px 14px), linear-gradient(160deg, #fff 0%, var(--color-neutral-50) 100%)",
};

export function ProductCard({
  locale,
  product,
  href,
  fitsRibbon,
  onAddToCart,
  imageSizes = DEFAULT_IMAGE_SIZES,
  className,
}: ProductCardProps) {
  const [notifyOpen, setNotifyOpen] = useState(false);
  const addItem = useCartStore((state) => state.addItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const cartQuantity = useCartStore(
    (state) => state.items.find((line) => line.productId === product.id)?.quantity ?? 0,
  );
  // A persisted cart is unreadable on the server, so until hydration the card
  // renders the button the server sent and swaps to the stepper after.
  const isHydrated = useIsHydrated();

  const { nameEn, nameFa, image, price, finalPrice, stockStatus, brand } = product;
  const outOfStock = stockStatus === "OUT_OF_STOCK";
  const discountPercent = getDiscountPercent(price, finalPrice);

  const primaryName = pickLocale(locale, nameEn, nameFa);
  const productHref = href ?? navHref(locale, `/products/${product.slug}`);

  // With `onAddToCart` the caller owns what "added" means, and the store isn't
  // it — that card keeps the plain button rather than reporting a count it has
  // no part in.
  const showStepper = !onAddToCart && isHydrated && cartQuantity > 0;

  const handleAddToCart = () => {
    if (onAddToCart) {
      onAddToCart(product);
      return;
    }
    const item: NewCartItem = {
      productId: product.id,
      slug: product.slug,
      nameEn,
      nameFa,
      image,
      // The captured price is what the customer was shown — checkout re-resolves
      // it server-side, so this is display state, never the charged amount.
      price: finalPrice,
    };
    addItem(item);
  };

  return (
    <article data-testid="product-card" className={`${CARD_CLASS} ${className ?? ""}`}>
      <div className={IMAGE_BOX_CLASS}>
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes={imageSizes}
            // `contain`, so the whole product is on screen — a bottle's label
            // included. Out of stock fades it, the thing you read before any
            // words when scanning a grid.
            className={`object-contain p-2 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
              outOfStock ? "opacity-55" : ""
            }`}
          />
        ) : (
          <span
            style={PLACEHOLDER_STYLE}
            className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-neutral-400"
          >
            <OilBottleIcon className="h-7 w-7" />
            <span className="font-mono text-[9.5px] tracking-[0.04em]">
              {pickLocale(locale, "no image", "بدون تصویر")}
            </span>
          </span>
        )}

        {discountPercent > 0 && (
          <span className="bg-accent pointer-events-none absolute start-2 top-2 rounded-full px-2 py-[3px] text-[11px] font-semibold text-white shadow-sm">
            {formatDiscountLabel(discountPercent, locale)}
          </span>
        )}

        {fitsRibbon && <div className="absolute end-2 top-2">{fitsRibbon}</div>}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 sm:mt-2.5">
        {brand && (
          <span className="text-accent truncate text-[11px] font-semibold tracking-[0.06em] uppercase sm:text-[11.5px]">
            {pickLocale(locale, brand.nameEn, brand.nameFa)}
          </span>
        )}
        <StockBadge locale={locale} status={stockStatus} className="ms-auto shrink-0" />
      </div>

      <div className={`mt-1 ${NAME_BLOCK_CLASS}`}>
        <Link
          href={productHref}
          title={primaryName}
          className="focus-visible:ring-accent hover:text-accent line-clamp-2 rounded text-[13.5px] leading-[19px] font-semibold tracking-[-0.015em] text-neutral-900 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:text-[14.5px] sm:leading-[21px]"
        >
          {/* Stretches the title's hit area over the whole card, so the picture
              is the link too — one link, rather than the image-plus-title pair
              a second anchor would announce. */}
          <span aria-hidden="true" className="absolute inset-0" />
          {primaryName}
        </Link>
      </div>

      <div className="mt-auto pt-1.5">
        <PriceDisplay locale={locale} price={price} finalPrice={finalPrice} size="md" />

        {outOfStock ? (
          <>
            {/* Out of stock isn't a dead card: the CTA turns into the ghost
                "Notify me" button and discloses the one-field capture rather
                than navigating away. */}
            <button
              type="button"
              onClick={() => setNotifyOpen((open) => !open)}
              aria-expanded={notifyOpen}
              className="focus-visible:ring-accent relative z-10 mt-2 min-h-10 w-full rounded-full border border-neutral-200 bg-white px-3 text-[13px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:mt-2.5 sm:min-h-11 sm:text-[13.5px]"
            >
              {pickLocale(locale, "Notify me", "خبرم کن")}
            </button>
            {notifyOpen && (
              <NotifyMeForm
                locale={locale}
                productRef={product.slug}
                autoFocus
                className="relative z-10 mt-2.5"
              />
            )}
          </>
        ) : showStepper ? (
          <CartQuantityControl
            locale={locale}
            productName={primaryName}
            quantity={cartQuantity}
            onChange={(next) => updateQuantity(product.id, next)}
          />
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            className="focus-visible:ring-accent bg-accent relative z-10 mt-2 min-h-10 w-full rounded-full px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:mt-2.5 sm:min-h-11 sm:text-[13.5px]"
          >
            {pickLocale(locale, "Add to cart", "افزودن به سبد")}
          </button>
        )}
      </div>
    </article>
  );
}

// What "Add to cart" becomes once the product is in the cart: the count, and the
// two buttons that change it. Deliberately not `QuantityStepper` — that
// control's typed input doesn't fit a grid tile, and stepping below one here
// means "take it out of the cart", where on the cart page removal is its own
// button. The box matches the pill it replaces exactly (h-11, same radius), so a
// card never changes height when it goes in or out of the cart.
//
// The stock ceiling is the store's per-line one, same as the PDP: a card knows a
// product is in stock, not by how much — the cart is where a line meets the live
// figure.
function CartQuantityControl({
  locale,
  productName,
  quantity,
  onChange,
}: {
  locale: Locale;
  productName: string;
  quantity: number;
  onChange: (quantity: number) => void;
}) {
  const removes = quantity <= 1;

  return (
    <div className="relative z-10 mt-2 flex h-10 w-full items-center justify-between rounded-full border border-neutral-200 bg-white sm:mt-2.5 sm:h-11">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        aria-label={`${
          removes
            ? pickLocale(locale, "Remove from cart", "حذف از سبد")
            : pickLocale(locale, "Decrease quantity", "کاهش تعداد")
        } — ${productName}`}
        className={STEP_BUTTON_CLASS}
      >
        <span aria-hidden="true">−</span>
      </button>

      <span role="status" className="text-[13.5px] font-semibold text-neutral-900 tabular-nums">
        <span className="sr-only">{pickLocale(locale, "In cart:", "در سبد:")} </span>
        {formatDigits(quantity, locale)}
      </span>

      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_CART_QUANTITY}
        aria-label={`${pickLocale(locale, "Increase quantity", "افزایش تعداد")} — ${productName}`}
        className={STEP_BUTTON_CLASS}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}

const STEP_BUTTON_CLASS =
  "focus-visible:ring-accent text-accent flex size-10 shrink-0 sm:size-11 items-center justify-center rounded-full text-[18px] leading-none transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none disabled:text-neutral-300 disabled:hover:bg-transparent";

// Same card, same proportions, neutral blocks, and deliberately no pulse — the
// prototype's handoff notes call for a still skeleton so a grid of them doesn't
// strobe while a PLP page loads.
export function ProductCardSkeleton() {
  return (
    <div data-testid="product-card-skeleton" aria-hidden="true" className={CARD_CLASS}>
      <span className={`${IMAGE_BOX_CLASS} block bg-neutral-100`} />
      <div className="mt-2 flex items-center justify-between gap-2 sm:mt-2.5">
        <span className="block h-3 w-16 rounded bg-neutral-200" />
        <span className="block h-3 w-14 rounded bg-neutral-200" />
      </div>
      <div className={`mt-1 flex flex-col gap-1.5 ${NAME_BLOCK_CLASS}`}>
        <span className="block h-3.5 w-full rounded bg-neutral-200" />
        <span className="block h-3.5 w-2/3 rounded bg-neutral-200" />
      </div>
      <div className="mt-auto pt-1.5">
        <span className="block h-5 w-24 rounded bg-neutral-200" />
        <span className="mt-2 block h-10 w-full rounded-full bg-neutral-200 sm:mt-2.5 sm:h-11" />
      </div>
    </div>
  );
}
