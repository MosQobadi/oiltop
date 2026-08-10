import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PublicSettings } from "@/server/setting";
import {
  breadcrumbListSchema,
  organizationSchema,
  productSchema,
  serializeJsonLd,
} from "./structured-data";

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://topoil.ir";
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
});

const settings: PublicSettings = {
  storeName: "Top Oil",
  supportEmail: "hi@topoil.ir",
  supportPhone: "021-1234",
  socialLinks: { instagram: "https://instagram.com/topoil", telegram: "" },
  defaultLocale: "EN",
  supportedLocales: ["EN", "FA"],
};

const product = {
  name: "Mobil 1 5W-30",
  url: "https://topoil.ir/en/products/mobil-1-5w30",
  sku: "MOB-1-5W30",
  brandName: "Mobil",
  finalPrice: 450_000,
  stockStatus: null,
};

describe("organizationSchema", () => {
  it("states the store's identity and contact details", () => {
    expect(organizationSchema(settings)).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Top Oil",
      url: "https://topoil.ir",
      email: "hi@topoil.ir",
      telephone: "021-1234",
      // The blank telegram entry is dropped, not published as an empty profile.
      sameAs: ["https://instagram.com/topoil"],
    });
  });

  it("omits contact fields an admin hasn't filled in", () => {
    const schema = organizationSchema({
      ...settings,
      supportEmail: "",
      supportPhone: "   ",
      socialLinks: null,
    });

    expect(schema).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Top Oil",
      url: "https://topoil.ir",
    });
  });

  // A fresh install has no store name, and a nameless Organization is invalid —
  // better to publish nothing than to publish that.
  it("returns null before the store has been named", () => {
    expect(organizationSchema({ ...settings, storeName: "  " })).toBeNull();
  });
});

describe("productSchema", () => {
  it("prices the offer in Rial, since ISO 4217 has no Toman", () => {
    const schema = productSchema(product);
    expect(schema.offers.priceCurrency).toBe("IRR");
    expect(schema.offers.price).toBe(4_500_000);
  });

  it("rounds away the fractions a discount multiplication leaves behind", () => {
    // 450_000 * (1 - 15/100) is 382_499.99999999994 in float maths.
    const schema = productSchema({ ...product, finalPrice: 450_000 * (1 - 15 / 100) });
    expect(schema.offers.price).toBe(3_825_000);
  });

  it("maps each stock state to its schema.org availability", () => {
    expect(productSchema({ ...product, stockStatus: null }).offers.availability).toBe(
      "https://schema.org/InStock",
    );
    expect(productSchema({ ...product, stockStatus: "LOW_STOCK" }).offers.availability).toBe(
      "https://schema.org/LimitedAvailability",
    );
    expect(productSchema({ ...product, stockStatus: "OUT_OF_STOCK" }).offers.availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("names the brand as a Brand node rather than a bare string", () => {
    expect(productSchema(product).brand).toEqual({ "@type": "Brand", name: "Mobil" });
  });

  // Uploads are stored site-relative; a crawler reading the file elsewhere needs
  // the origin.
  it("absolutizes an uploaded image but leaves an external URL alone", () => {
    expect(productSchema({ ...product, image: "/uploads/mobil.png" }).image).toBe(
      "https://topoil.ir/uploads/mobil.png",
    );
    expect(productSchema({ ...product, image: "https://cdn.example.com/m.png" }).image).toBe(
      "https://cdn.example.com/m.png",
    );
  });

  it("omits image and description when the product has neither", () => {
    const schema = productSchema({ ...product, image: null, description: "  " });
    expect(schema).not.toHaveProperty("image");
    expect(schema).not.toHaveProperty("description");
  });
});

describe("breadcrumbListSchema", () => {
  it("numbers the trail from one and links every crumb but the current page", () => {
    expect(
      breadcrumbListSchema([
        { label: "Home", href: "/en" },
        { label: "Products", href: "/en/products" },
        { label: "Mobil 1 5W-30" },
      ]),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://topoil.ir/en" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Products",
          item: "https://topoil.ir/en/products",
        },
        { "@type": "ListItem", position: 3, name: "Mobil 1 5W-30" },
      ],
    });
  });

  // The visible trail carries the customer's car along; the structured one
  // points at the canonical page the alternates declare.
  it("strips the ?fit= context the visible crumbs carry", () => {
    const [crumb] = breadcrumbListSchema([
      { label: "Products", href: "/fa/products?fit=eng_123" },
    ]).itemListElement;

    expect(crumb?.item).toBe("https://topoil.ir/fa/products");
  });
});

describe("serializeJsonLd", () => {
  // An admin-entered name is untrusted markup once it's inside a <script>.
  it("escapes < so a product name can't close the script block", () => {
    const json = serializeJsonLd(
      productSchema({ ...product, name: "Mobil 1 </script><script>alert(1)</script>" }),
    );

    expect(json).not.toContain("</script>");
    expect(json).toContain("\\u003c/script>");
    // Still the same object once parsed — the escape is HTML-level, not a
    // change to the data.
    expect((JSON.parse(json) as { name: string }).name).toBe(
      "Mobil 1 </script><script>alert(1)</script>",
    );
  });
});
