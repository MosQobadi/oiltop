import type { Metadata } from "next";
import { AccountRegisterForm } from "@/components/storefront/account/AccountRegisterForm";
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
    title: pickLocale(locale, "Create an account", "ساخت حساب کاربری"),
    robots: { index: false, follow: true },
  };
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  // Carried over from /login's tab switch, so a customer the guard sent here
  // still ends up on the page they were trying to reach — see the login page.
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
        active="register"
        from={from}
        title={pickLocale(locale, "Create an account", "ساخت حساب کاربری")}
        subtitle={pickLocale(
          locale,
          "A phone number and password is all we need.",
          "فقط یک شماره موبایل و گذرواژه لازم است.",
        )}
      >
        <AccountRegisterForm locale={locale} from={from} />
      </AuthCard>
    </div>
  );
}
