import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { CartView } from "@/components/storefront/cart/CartView";
import { navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";

// The one storefront screen with nothing to render on the server: the cart is
// localStorage (Design Decision 4), so this page is a shell around a client
// component and the whole of it — lines, subtotal, availability — is assembled
// in the browser by useCartLines.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pickLocale(locale, "Your cart", "سبد خرید شما"),
    // One customer's cart is not a page a search engine has any use for, and
    // the HTML it would index is an empty shell either way.
    robots: { index: false, follow: true },
  };
}

export default async function CartPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: pickLocale(locale, "Cart", "سبد خرید") },
        ]}
        className="mb-5"
      />

      <CartView locale={locale} />
    </div>
  );
}
