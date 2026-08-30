"use client";

import { useState, type ReactNode } from "react";
import { useIsHydrated } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";
import { OilBottleIcon } from "./icons";
import { NotifyMeForm } from "./NotifyMeForm";
import { navHref } from "./nav-items";
import { PriceDisplay } from "./PriceDisplay";
import { type StockBadgeStatus } from "./StockBadge";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { useCartStore, type NewCartItem } from "@/lib/store/cart";
import { MAX_CART_QUANTITY } from "@/lib/storefront/cart";
import { formatDiscountLabel, getDiscountPercent } from "@/lib/storefront/pricing";

// One photograph, and everything else laid over it: brand, name, then price and
// stock on a line, then the action.
//
// The picture is the whole card rather than a panel inside one. What makes that
// legible over a white-background product shot — the house standard, see
// CLAUDE.md — is the scrim: opaque enough at the bottom edge to carry white text
// over pure white, and the image anchored to the top so the product sits above
// it rather than behind it.
//
// The trade is real and was made deliberately: this costs the bottom third of
// every photograph, and it asks more of the artwork than text on the card's own
// ground did. If the catalog ever carries shots that fill the frame or run dark,
// revisit the scrim rather than fighting it.

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
   * The card's shape. `"tall"` is for grids wider than the PLP's four-up — the
   * fitment results run three across, where a card gets more width and wants
   * the height to match it.
   */
  imageBox?: ImageBoxSize;
  /** Appended to the card's own classes — layout only. */
  className?: string;
}

const DEFAULT_IMAGE_SIZES = "(min-width: 1024px) 260px, (min-width: 640px) 33vw, 50vw";

export type ImageBoxSize = "default" | "tall";

// A minimum height rather than a fixed ratio: the card's height is its content's,
// so an opened "Notify me" form pushes one card taller and `h-full` brings the
// rest of the row with it.
//
// Taller than a card with its text underneath would need to be, and that is the
// point. The words sit on the picture, so the picture has to be tall enough to
// still show a product above them — at 380px the name landed across a bottle's
// label. This is the overlay's standing cost, paid in height.
const CARD_MIN_HEIGHT: Record<ImageBoxSize, string> = {
  default: "min-h-[440px]",
  tall: "min-h-[490px]",
};

const CARD_CLASS =
  "group relative flex h-full flex-col overflow-hidden rounded-3xl bg-neutral-200 transition-shadow duration-200 hover:shadow-[0_18px_40px_-24px_rgb(15_23_42/0.65)] focus-within:shadow-[0_18px_40px_-24px_rgb(15_23_42/0.65)]";

// Two stops, not one. A single fade to transparent is either too weak at the
// bottom to carry white text over a white photograph, or so strong by mid-card
// that it reads as a grey box laid on the picture. Opaque where the words are,
// gone before the halfway mark.
const SCRIM_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-neutral-950/95 via-neutral-950/78 to-transparent";

// Frosted, because a chip sits on the picture as often as on the scrim, and the
// picture behind it is whatever the photographer sent.
const CHIP_CLASS =
  "inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-medium text-white ring-1 ring-white/25 backdrop-blur-sm";

// A missing image is still the norm for a catalog mid-import, so the placeholder
// is a designed state rather than a broken-image icon. Darker than the version
// that sat in a light panel: white text and the scrim are laid over this too, so
// it has to be a ground they can be read against.
const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-600) 0 1px, transparent 1px 14px), linear-gradient(160deg, var(--color-neutral-700) 0%, var(--color-neutral-900) 100%)",
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
      className={`${CARD_CLASS} ${CARD_MIN_HEIGHT[imageBox]} ${className ?? ""}`}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes={imageSizes}
          // `cover`, anchored to the top: the scrim owns the bottom third, so a
          // bottle centred in its own frame would sit half behind it. Out of
          // stock fades the product — the thing you read before any words.
          className={`object-cover object-top transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
            outOfStock ? "opacity-45" : ""
          }`}
        />
      ) : (
        <span
          aria-hidden="true"
          style={PLACEHOLDER_STYLE}
          className="absolute inset-0 flex items-start justify-center pt-16 text-neutral-500"
        >
          <OilBottleIcon className="h-10 w-10" />
        </span>
      )}

      <span aria-hidden="true" className={SCRIM_CLASS} />

      {/* Corner slots. The discount leads because it is the one that changes a
          decision; "fits your car" takes the trailing corner when a caller
          passes it. The empty span keeps the discount at the start edge when
          there is no discount to show. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3.5">
        {discountPercent > 0 ? (
          <span className="bg-accent rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
            {formatDiscountLabel(discountPercent, locale)}
          </span>
        ) : (
          <span />
        )}
        {fitsRibbon}
      </div>

      {/* In flow with `mt-auto` rather than absolutely positioned: an opened
          Notify form grows the card instead of overflowing it. */}
      <div className="relative mt-auto flex flex-col gap-2 p-3.5">
        {/* The reference card sets its name and price on one line, which works
            for "Alphonso" and not for "Mann-Filter CU 2545 Cabin Filter". At
            this column width the price took half the row and left the name a
            truncated stub, so the name gets the full width and the price shares
            its line with the stock chip instead. */}
        {brand && (
          <span className={`${CHIP_CLASS} max-w-full self-start truncate`}>
            {pickLocale(locale, brand.nameEn, brand.nameFa)}
          </span>
        )}

        <Link
          href={productHref}
          title={primaryName}
          className="focus-visible:ring-accent line-clamp-2 rounded text-[15.5px] leading-[21px] font-semibold tracking-[-0.015em] text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {/* Stretches the title's hit area over the whole card, so the picture
              is the link too — one link, rather than the image-plus-title pair
              a second anchor would announce. */}
          <span aria-hidden="true" className="absolute inset-0" />
          {primaryName}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5">
          <PriceDisplay
            locale={locale}
            price={price}
            finalPrice={finalPrice}
            size="md"
            tone="inverse"
          />
          <StockChip locale={locale} status={stockStatus} />
        </div>

        {outOfStock ? (
          <>
            <button
              type="button"
              onClick={() => setNotifyOpen((open) => !open)}
              aria-expanded={notifyOpen}
              className="focus-visible:ring-accent relative z-10 min-h-12 w-full rounded-full bg-white/20 px-3 text-[13.5px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm transition-colors hover:bg-white/30 focus-visible:ring-2 focus-visible:outline-none"
            >
              {pickLocale(locale, "Notify me", "خبرم کن")}
            </button>
            {notifyOpen && (
              // On its own opaque ground: the form's inputs and its validation
              // messages are dark-on-light, and neither survives the scrim.
              <NotifyMeForm
                locale={locale}
                productRef={product.slug}
                autoFocus
                className="relative z-10 rounded-2xl bg-white p-2.5"
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
            // White, the way the reference card does it. The accent is spoken
            // for by the discount chip above, and a solid white pill is the
            // highest-contrast thing available over a scrim.
            className="focus-visible:ring-accent relative z-10 min-h-12 w-full rounded-full bg-white px-3 text-[13.5px] font-semibold text-neutral-900 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Add to cart", "افزودن به سبد")}
          </button>
        )}
      </div>
    </article>
  );
}

// The stock line as a chip on the picture, rather than the page's `StockBadge`:
// that component is built for a light ground and its three tints don't survive
// being laid over a photograph. Same three states, same words — including the
// `null` one, which is `StockBadgeStatus` for "we have plenty" and the only
// state the badge on the page draws nothing at all for.
function StockChip({ locale, status }: { locale: Locale; status: StockBadgeStatus }) {
  const dot =
    status === "OUT_OF_STOCK"
      ? "bg-neutral-300"
      : status === "LOW_STOCK"
        ? "bg-amber-400"
        : "bg-emerald-400";

  const label =
    status === "OUT_OF_STOCK"
      ? pickLocale(locale, "Out of stock", "ناموجود")
      : status === "LOW_STOCK"
        ? pickLocale(locale, "Low stock", "موجودی کم")
        : pickLocale(locale, "In stock", "موجود");

  return (
    <span className={CHIP_CLASS}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// What "Add to cart" becomes once the product is in the cart: the count, and the
// two buttons that change it. The box matches the pill it replaces exactly, so a
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
    <div className="relative z-10 flex h-12 w-full items-center justify-between rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
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

      <span role="status" className="text-[13.5px] font-semibold text-white tabular-nums">
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
  "focus-visible:ring-accent flex size-12 shrink-0 items-center justify-center rounded-full text-[18px] leading-none text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:outline-none disabled:text-white/40 disabled:hover:bg-transparent";

// Same card, same proportions, neutral blocks, and deliberately no pulse — the
// prototype's handoff notes call for a still skeleton so a grid of them doesn't
// strobe while a PLP page loads.
export function ProductCardSkeleton() {
  return (
    <div
      data-testid="product-card-skeleton"
      aria-hidden="true"
      className={`${CARD_CLASS} ${CARD_MIN_HEIGHT.default} !bg-neutral-100`}
    >
      <div className="mt-auto flex flex-col gap-2.5 p-3.5">
        <div className="flex items-end justify-between gap-2.5">
          <span className="block h-4 w-2/3 rounded bg-neutral-200" />
          <span className="block h-4 w-16 rounded bg-neutral-200" />
        </div>
        <div className="flex gap-1.5">
          <span className="block h-6 w-20 rounded-full bg-neutral-200" />
          <span className="block h-6 w-24 rounded-full bg-neutral-200" />
        </div>
        <span className="block h-12 w-full rounded-full bg-neutral-200" />
      </div>
    </div>
  );
}
