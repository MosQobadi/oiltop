import type { StorefrontStockStatus } from "@/lib/services/catalog";
import type { PublicSettings } from "@/server/setting";
import { absoluteUrl } from "./sitemap";

// The schema.org objects the storefront publishes, built as plain data so they
// can be unit-tested without rendering a page. `components/storefront/JsonLd`
// is the only thing that turns one of these into a <script> tag.
//
// Every builder is deliberately narrow: it describes what is already on the
// page and nothing more. Structured data that claims something the reader can't
// see is what gets a site's rich results turned off, so ratings, availability
// dates and prices we don't actually hold are absent rather than guessed.

const CONTEXT = "https://schema.org";

export interface OrganizationSchema {
  "@context": typeof CONTEXT;
  "@type": "Organization";
  name: string;
  url: string;
  email?: string;
  telephone?: string;
  sameAs?: string[];
}

export interface ProductSchema {
  "@context": typeof CONTEXT;
  "@type": "Product";
  name: string;
  url: string;
  sku: string;
  brand: { "@type": "Brand"; name: string };
  offers: {
    "@type": "Offer";
    url: string;
    price: number;
    priceCurrency: "IRR";
    availability: string;
  };
  description?: string;
  image?: string;
}

export interface BreadcrumbListSchema {
  "@context": typeof CONTEXT;
  "@type": "BreadcrumbList";
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    item?: string;
  }[];
}

export type StructuredData = OrganizationSchema | ProductSchema | BreadcrumbListSchema;

// JSON inside <script> is HTML, not JSON: an admin-entered product name
// containing "</script>" would otherwise close the block and put the rest of the
// object into the document. Escaping "<" is enough to make that impossible and
// still parses as the same JSON.
export function serializeJsonLd(data: StructuredData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function trimmed(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result === "" ? undefined : result;
}

// Uploads are stored site-relative ("/uploads/…"), and a crawler handed the
// page out of context needs the origin — but a value that is already absolute
// is left alone rather than pasted onto the origin twice.
function absoluteAsset(value: string): string {
  return /^https?:\/\//i.test(value) ? value : absoluteUrl(value);
}

// Sourced from the Settings a customer is already allowed to see, so nothing
// here can leak a private setting into the page head. Null when the store has
// no name yet: an Organization without one is invalid, and a fresh install has
// an empty `storeName` until an admin fills it in.
export function organizationSchema(settings: PublicSettings): OrganizationSchema | null {
  const name = trimmed(settings.storeName);
  if (!name) return null;

  // The social links the footer already renders, as the identities schema.org
  // uses to tie this site to the same business elsewhere.
  const sameAs = Object.values(settings.socialLinks ?? {})
    .map(trimmed)
    .filter((link): link is string => link !== undefined);

  const email = trimmed(settings.supportEmail);
  const telephone = trimmed(settings.supportPhone);

  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name,
    url: absoluteUrl(""),
    ...(email ? { email } : {}),
    ...(telephone ? { telephone } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

// What the storefront's three stock states mean to a crawler. "Low stock" is
// genuinely limited availability rather than plain in-stock, and null — at or
// above the threshold — is the ordinary case that needs no badge on the page
// either (see `deriveStorefrontStockStatus`).
const AVAILABILITY: Record<StorefrontStockStatus | "IN_STOCK", string> = {
  OUT_OF_STOCK: `${CONTEXT}/OutOfStock`,
  LOW_STOCK: `${CONTEXT}/LimitedAvailability`,
  IN_STOCK: `${CONTEXT}/InStock`,
};

// Prices are held in Toman (see lib/storefront/pricing), and schema.org wants
// ISO 4217 — which has no Toman code. IRR (Rial) is the only valid one for
// Iran, so the offer is stated in Rial at the fixed statutory rate rather than
// labelling a Toman figure with a code that means something ten times smaller.
const RIAL_PER_TOMAN = 10;

export interface ProductSchemaInput {
  /** Already localized, as rendered in the page's <h1>. */
  name: string;
  /** The page's own absolute canonical URL — car-agnostic, per Design Decision 5. */
  url: string;
  sku: string;
  brandName: string;
  /** Toman, after any discount — what the customer is actually asked to pay. */
  finalPrice: number;
  stockStatus: StorefrontStockStatus | null;
  description?: string;
  image?: string | null;
}

export function productSchema(input: ProductSchemaInput): ProductSchema {
  const image = trimmed(input.image);
  const description = trimmed(input.description);

  return {
    "@context": CONTEXT,
    "@type": "Product",
    name: input.name,
    url: input.url,
    sku: input.sku,
    brand: { "@type": "Brand", name: input.brandName },
    offers: {
      "@type": "Offer",
      url: input.url,
      price: Math.round(input.finalPrice * RIAL_PER_TOMAN),
      priceCurrency: "IRR",
      availability: AVAILABILITY[input.stockStatus ?? "IN_STOCK"],
    },
    ...(description ? { description } : {}),
    ...(image ? { image: absoluteAsset(image) } : {}),
  };
}

/** Structurally what `BreadcrumbItem` in components/storefront/Breadcrumbs is. */
export interface BreadcrumbSchemaItem {
  label: string;
  href?: string;
}

// Built from the same array the visible trail renders, so the two can't drift —
// a BreadcrumbList that disagrees with the crumbs on screen is worse than none.
//
// The query string is dropped: the visible trail carries `?fit=` so a customer
// keeps their car while browsing, but the crumb *is* the canonical page, which
// is the URL the alternates in ./seo declare.
export function breadcrumbListSchema(items: BreadcrumbSchemaItem[]): BreadcrumbListSchema {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      // The last crumb is the current page and has no href; schema.org allows a
      // ListItem with a name and no `item`, which is exactly that case.
      const [path] = (item.href ?? "").split("?");
      return {
        "@type": "ListItem" as const,
        position: index + 1,
        name: item.label,
        ...(path ? { item: absoluteUrl(path) } : {}),
      };
    }),
  };
}
