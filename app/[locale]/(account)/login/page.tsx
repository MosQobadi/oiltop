import type { Metadata } from "next";
import { AccountLoginForm } from "@/components/storefront/account/AccountLoginForm";
import { AuthCard } from "@/components/storefront/account/AuthCard";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pickLocale(locale, "Log in", "ورود"),
    // A sign-in form has nothing for a search engine to rank, and indexing it
    // only competes with the pages that do — same call as the cart.
    robots: { index: false, follow: true },
  };
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  // `from` is set by the route guard in `proxy.ts`. Read here rather than with
  // `useSearchParams()` in the form, so the form stays a plain-props component
  // and there is no Suspense boundary to keep in sync with it. It makes the
  // screen dynamic, which a noindex sign-in form has nothing to lose by.
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ locale }, { from }] = await Promise.all([params, searchParams]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: pickLocale(locale, "Account", "حساب من") },
        ]}
        className="mb-8"
      />

      <AuthCard
        locale={locale}
        active="login"
        from={from}
        title={pickLocale(locale, "Welcome back", "خوش آمدید")}
        subtitle={pickLocale(
          locale,
          "Sign in to see order history and repeat an order in one tap.",
          "وارد شوید تا تاریخچه سفارش‌ها را ببینید و با یک لمس دوباره سفارش دهید.",
        )}
      >
        <AccountLoginForm locale={locale} from={from} />
      </AuthCard>
    </div>
  );
}
