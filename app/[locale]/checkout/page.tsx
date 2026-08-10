import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { CheckoutView } from "@/components/storefront/checkout/CheckoutView";
import { CART_PATH, navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";

// Like the cart, a shell around a client component: what is being checked out
// lives in localStorage, so there is nothing for the server to render and the
// whole screen — lines, totals, availability — is assembled in the browser.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pickLocale(locale, "Checkout", "تسویه حساب"),
    // Nothing here is worth indexing and the HTML a crawler would get is an
    // empty shell — the same call the cart makes.
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: pickLocale(locale, "Cart", "سبد خرید"), href: navHref(locale, CART_PATH) },
          { label: pickLocale(locale, "Checkout", "تسویه حساب") },
        ]}
        className="mb-5"
      />

      <CheckoutView locale={locale} />
    </div>
  );
}
