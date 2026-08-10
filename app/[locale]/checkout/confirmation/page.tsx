import type { Metadata } from "next";
import { OrderConfirmation } from "@/components/storefront/checkout/OrderConfirmation";
import { pickLocale, type Locale } from "@/lib/i18n";

// The receipt. It has no `id` segment because there is nothing here to look up:
// a guest order can't be fetched back (there's no owner to check it against),
// so the confirmation renders the snapshot the checkout POST returned, handed
// over in sessionStorage. Order *history* for a signed-in customer is Task 9.1,
// and it reads the database.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pickLocale(locale, "Order confirmation", "تأیید سفارش"),
    robots: { index: false, follow: false },
  };
}

export default async function CheckoutConfirmationPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <OrderConfirmation locale={locale} />
    </div>
  );
}
