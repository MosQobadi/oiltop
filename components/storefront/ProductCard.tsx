"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { NotifyMeForm } from "./NotifyMeForm";
import { navHref } from "./nav-items";
import { PriceDisplay } from "./PriceDisplay";
import { StockBadge, type StockBadgeStatus } from "./StockBadge";
import { pickLocale, type Locale } from "@/lib/i18n";
import { useCartStore, type NewCartItem } from "@/lib/store/cart";
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
}

const DEFAULT_IMAGE_SIZES = "(min-width: 1024px) 216px, (min-width: 640px) 33vw, 45vw";

const CARD_CLASS =
  "focus-within:border-accent/50 hover:border-accent/50 flex flex-col gap-2.5 rounded-2xl border border-neutral-200 bg-white p-3.5 transition-colors";

const IMAGE_BOX_CLASS = "relative h-[140px] overflow-hidden rounded-lg bg-neutral-100";

// A missing image is the norm for a catalog mid-import, so the placeholder is a
// designed state (the prototype's hatched slot), not a broken-image icon.
const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-200) 0 1px, transparent 1px 9px)",
};

export function ProductCard({
  locale,
  product,
  href,
  fitsRibbon,
  onAddToCart,
  imageSizes = DEFAULT_IMAGE_SIZES,
}: ProductCardProps) {
  const [notifyOpen, setNotifyOpen] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const { nameEn, nameFa, image, price, finalPrice, stockStatus, brand } = product;
  const outOfStock = stockStatus === "OUT_OF_STOCK";
  const discountPercent = getDiscountPercent(price, finalPrice);

  const primaryName = pickLocale(locale, nameEn, nameFa);
  // The other language's name, when there is a distinct one: shoppers here
  // search for "Mobil 1" and "موبیل ۱" interchangeably, so the card carries both.
  const secondaryName = locale === "fa" ? nameEn : nameFa;
  const showSecondaryName = secondaryName.trim() !== "" && secondaryName !== primaryName;

  const productHref = href ?? navHref(locale, `/products/${product.slug}`);

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
    <article data-testid="product-card" className={CARD_CLASS}>
      <div className={IMAGE_BOX_CLASS}>
        {/* Duplicate of the title link below, hidden from assistive tech and the
            tab order so the card offers one link, not two identical ones. */}
        <Link href={productHref} aria-hidden="true" tabIndex={-1} className="block h-full w-full">
          {image ? (
            <Image src={image} alt="" fill sizes={imageSizes} className="object-contain p-2" />
          ) : (
            <span
              style={PLACEHOLDER_STYLE}
              className="flex h-full w-full items-center justify-center font-mono text-[9.5px] tracking-[0.04em] text-neutral-500"
            >
              {pickLocale(locale, "no image", "بدون تصویر")}
            </span>
          )}
        </Link>

        {discountPercent > 0 && (
          <span className="bg-accent pointer-events-none absolute start-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white">
            {formatDiscountLabel(discountPercent, locale)}
          </span>
        )}

        {fitsRibbon && <div className="absolute end-2 top-2">{fitsRibbon}</div>}
      </div>

      <div className="flex items-center justify-between gap-2">
        {brand && (
          <span className="truncate font-mono text-[11.5px] tracking-[0.04em] text-neutral-500">
            {pickLocale(locale, brand.nameEn, brand.nameFa)}
          </span>
        )}
        <StockBadge locale={locale} status={stockStatus} className="ms-auto shrink-0" />
      </div>

      <div>
        <Link
          href={productHref}
          className="focus-visible:ring-accent hover:text-accent rounded text-[13.5px] leading-snug font-medium text-neutral-900 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {primaryName}
        </Link>
        {showSecondaryName && (
          <p dir="auto" className="mt-0.5 text-[12.5px] text-neutral-500">
            {secondaryName}
          </p>
        )}
      </div>

      <div className="mt-auto pt-1">
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
              className="focus-visible:ring-accent mt-2.5 min-h-11 w-full rounded-[9px] border border-neutral-200 bg-white px-3 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
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
        ) : (
          <button
            type="button"
            onClick={handleAddToCart}
            className="focus-visible:ring-accent bg-accent mt-2.5 min-h-11 w-full rounded-[9px] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Add to cart", "افزودن به سبد")}
          </button>
        )}
      </div>
    </article>
  );
}

// Same card, same box sizes, neutral blocks, and deliberately no pulse — the
// prototype's handoff notes call for a still skeleton so a grid of them doesn't
// strobe while a PLP page loads.
export function ProductCardSkeleton() {
  return (
    <div data-testid="product-card-skeleton" aria-hidden="true" className={CARD_CLASS}>
      <div className={IMAGE_BOX_CLASS} />
      <div className="flex items-center justify-between gap-2">
        <span className="h-3 w-16 rounded bg-neutral-100" />
        <span className="h-3 w-14 rounded bg-neutral-100" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="h-3.5 w-full rounded bg-neutral-100" />
        <span className="h-3 w-2/3 rounded bg-neutral-100" />
      </div>
      <div className="mt-auto pt-1">
        <span className="block h-4 w-24 rounded bg-neutral-100" />
        <span className="mt-2.5 block h-11 w-full rounded-[9px] bg-neutral-100" />
      </div>
    </div>
  );
}
