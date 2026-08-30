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
  /**
   * The image panel's aspect ratio. `"tall"` (4:5) is for grids wider than the
   * PLP's four-up, where a square panel on a 360px card is a lot of empty
   * ground around one bottle.
   */
  imageBox?: ImageBoxSize;
  /** Appended to the card's own classes — layout only. */
  className?: string;
}

const DEFAULT_IMAGE_SIZES = "(min-width: 1024px) 216px, (min-width: 640px) 33vw, 45vw";

// The card has no frame of its own — it earns an edge on hover, as a lift rather
// than a line. It keeps its padding, though: dropping the border and the padding
// together left the name, the price and a full-width button running flush to the
// card's edge, and the panels of adjacent cards nearly touching. The frame was
// the thing that read as redundant, not the space inside it.
//
// `h-full` so a card always fills its grid cell (or rail slot): the name block
// below is fixed, but an opened "Notify me" form can still make one card taller,
// and the rest of the row should follow it rather than float.
//
// The lift is spelled out twice rather than shared through a variable: Tailwind
// compiles the classes it can find in the source, so an interpolated
// `hover:${LIFT}` names a class at runtime that was never generated.
const CARD_CLASS =
  "group flex h-full flex-col rounded-2xl bg-white p-3 transition-shadow duration-200 hover:shadow-[0_12px_32px_-20px_rgb(15_23_42/0.55)] focus-within:shadow-[0_12px_32px_-20px_rgb(15_23_42/0.55)]";

export type ImageBoxSize = "default" | "tall";

// One step tighter than the card's radius, because it sits inside the card's
// padding: nesting two equal radii makes the inner corner read sharper than the
// outer one.
const IMAGE_BOX_CLASS = "relative overflow-hidden rounded-xl";

// The panel's ground depends on what's in it, and the reason is the house rule
// that product photography is shot on white.
//
// A white-background photo in `object-contain` never fills a square panel — a
// tall bottle leaves bands down the sides, a wide filter leaves them top and
// bottom. On a tinted panel those bands frame the shot in grey and the product
// reads as a white rectangle someone pasted in. White panel, and the same photo
// simply sits on the card.
//
// The placeholder keeps a tinted ground for the opposite reason: there is no
// image to blend with, and a hatch floating on white with no panel behind it
// has no shape at all. It paints its own background, so this only has to get
// out of its way.
const IMAGE_GROUND: Record<"image" | "placeholder", string> = {
  image: "bg-white ring-1 ring-neutral-100 ring-inset",
  placeholder: "bg-neutral-50",
};

// An aspect ratio, not a pixel height. The old fixed 140px was a letterbox at
// every card width — a contained bottle sat in a wide, short slot with air down
// both sides. A ratio keeps the product the same size relative to its card
// whether the grid is four up or two, which is what makes a page of these look
// deliberate rather than laid out for one breakpoint.

const IMAGE_BOX_RATIO: Record<ImageBoxSize, string> = {
  default: "aspect-square",
  tall: "aspect-[4/5]",
};

function imageBoxClass(size: ImageBoxSize, hasImage: boolean): string {
  return `${IMAGE_BOX_CLASS} ${IMAGE_BOX_RATIO[size]} ${
    IMAGE_GROUND[hasImage ? "image" : "placeholder"]
  }`;
}

// The name block is a fixed two lines of title plus one of the secondary name —
// 2×20px + 2px + 18px at the leadings set on them below. Product names here run
// from "فیلتر هوا دنسو" to a full spec string, and letting that decide the card's
// height left every row a different size and the price rows off any shared
// baseline. Clamping (not scrolling, not stretching) keeps the grid regular; the
// full name is one click away on the product page.
const NAME_BLOCK_CLASS = "h-[60px]";

// A missing image is the norm for a catalog mid-import, so the placeholder is a
// designed state, not a broken-image icon: the prototype's hatched slot, lit by
// a soft wash so a grid (or a rail) of imageless products still has depth. The
// hatch is listed first because layers paint front-to-back — the opaque wash
// underneath it would otherwise be the only thing visible.
//
// Loosened from 9px to 14px and lightened a shade when the panel went square:
// the hatch was drawn for a 140px letterbox, and at four times the area the same
// density stopped reading as a texture and started reading as the loudest thing
// in the grid. Most of this catalog has no photograph yet, so this pattern is
// what a customer mostly sees — it has to recede.
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
  imageBox = "default",
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
  // The other language's name, when there is a distinct one: shoppers here
  // search for "Mobil 1" and "موبیل ۱" interchangeably, so the card carries both.
  const secondaryName = locale === "fa" ? nameEn : nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== primaryName;

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
    <article
      data-testid="product-card"
      className={className ? `${CARD_CLASS} ${className}` : CARD_CLASS}
    >
      <div className={imageBoxClass(imageBox, image !== null)}>
        {/* Duplicate of the title link below, hidden from assistive tech and the
            tab order so the card offers one link, not two identical ones. */}
        <Link href={productHref} aria-hidden="true" tabIndex={-1} className="block h-full w-full">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes={imageSizes}
              // Out of stock is said three ways on this card — the badge, the
              // CTA, and here. Fading the product itself is the one a customer
              // reads before any words, scanning a grid.
              className={`object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
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
        </Link>

        {discountPercent > 0 && (
          <span className="bg-accent pointer-events-none absolute start-2.5 top-2.5 rounded-full px-2 py-[3px] text-[11px] font-semibold text-white shadow-sm">
            {formatDiscountLabel(discountPercent, locale)}
          </span>
        )}

        {fitsRibbon && <div className="absolute end-2.5 top-2.5">{fitsRibbon}</div>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {brand && (
          <span className="truncate font-mono text-[11px] tracking-[0.06em] text-neutral-400 uppercase">
            {pickLocale(locale, brand.nameEn, brand.nameFa)}
          </span>
        )}
        <StockBadge locale={locale} status={stockStatus} className="ms-auto shrink-0" />
      </div>

      <div className={`mt-1.5 ${NAME_BLOCK_CLASS}`}>
        <Link
          href={productHref}
          title={primaryName}
          className="focus-visible:ring-accent hover:text-accent line-clamp-2 rounded text-[14px] leading-[20px] font-medium tracking-[-0.01em] text-neutral-900 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {primaryName}
        </Link>
        {showSecondaryName && (
          <p dir="auto" className="mt-0.5 truncate text-[12.5px] leading-[18px] text-neutral-500">
            {secondaryName}
          </p>
        )}
      </div>

      <div className="mt-auto pt-1.5">
        <PriceDisplay locale={locale} price={price} finalPrice={finalPrice} />

        {outOfStock ? (
          <>
            {/* Out of stock isn't a dead card: the CTA turns into the ghost
                "Notify me" button from the prototype and discloses the one-field
                capture (Design Decision 9) rather than navigating away. */}
            <button
              type="button"
              onClick={() => setNotifyOpen((open) => !open)}
              aria-expanded={notifyOpen}
              className="focus-visible:ring-accent mt-2.5 min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {pickLocale(locale, "Notify me", "خبرم کن")}
            </button>
            {notifyOpen && (
              <NotifyMeForm
                locale={locale}
                productRef={product.slug}
                autoFocus
                className="mt-2.5"
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
            // Outlined at rest, accent on hover. Solid-filled it was the loudest
            // thing on the card and, twenty to a page, the loudest thing on the
            // grid — a wall of orange under the products it was meant to serve.
            // The accent still arrives on contact, and the PDP's buy box keeps
            // the solid primary where the decision actually gets made.
            className="focus-visible:ring-accent hover:border-accent hover:bg-accent mt-2.5 min-h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-900 transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Add to cart", "افزودن به سبد")}
          </button>
        )}
      </div>
    </article>
  );
}

// What the "Add to cart" button becomes once the product is in the cart: the
// count, and the two buttons that change it. Deliberately not `QuantityStepper`
// — that control's typed input doesn't fit a grid tile, and stepping below one
// here means "take it out of the cart", where on the cart page removal is its
// own button. The box matches the button it replaces exactly (h-11, same
// radius), so a card never changes height when it goes in or out of the cart.
//
// The stock ceiling is the store's per-line one, same as the PDP: a card knows
// a product is in stock, not by how much — the cart is where a line meets the
// live figure.
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
    <div className="border-accent/40 bg-accent/[0.07] mt-2.5 flex h-11 w-full items-center justify-between rounded-xl border">
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

      <span role="status" className="text-[13px] font-medium text-neutral-900 tabular-nums">
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
  "focus-visible:ring-accent text-accent hover:bg-accent/10 flex size-11 shrink-0 items-center justify-center rounded-xl text-[18px] leading-none transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:text-neutral-300 disabled:hover:bg-transparent";

// Same card, same box sizes, neutral blocks, and deliberately no pulse — the
// prototype's handoff notes call for a still skeleton so a grid of them doesn't
// strobe while a PLP page loads.
export function ProductCardSkeleton() {
  return (
    <div data-testid="product-card-skeleton" aria-hidden="true" className={CARD_CLASS}>
      <div className={imageBoxClass("default", false)} />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="h-3 w-16 rounded bg-neutral-100" />
        <span className="h-3 w-14 rounded bg-neutral-100" />
      </div>
      <div className={`mt-1.5 ${NAME_BLOCK_CLASS}`}>
        <span className="block h-3.5 w-full rounded bg-neutral-100" />
        <span className="mt-1.5 block h-3.5 w-4/5 rounded bg-neutral-100" />
        <span className="mt-2 block h-3 w-2/3 rounded bg-neutral-100" />
      </div>
      <div className="mt-auto pt-1.5">
        <span className="block h-4 w-24 rounded bg-neutral-100" />
        <span className="mt-2.5 block h-11 w-full rounded-xl bg-neutral-100" />
      </div>
    </div>
  );
}
