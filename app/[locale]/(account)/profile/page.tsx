import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountProfileForm } from "@/components/storefront/account/AccountProfileForm";
import { SignOutButton } from "@/components/storefront/account/SignOutButton";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import {
  ACCOUNT_ORDERS_PATH,
  ACCOUNT_PROFILE_PATH,
  loginHref,
  navHref,
} from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { getCurrentUser, getCustomerProfile } from "@/server/auth";

// The customer's own details. Read from `server/auth` directly rather than by
// fetching this app's own API — same reasoning as the orders screen, which is
// also why /api/storefront/me has no GET: the only reader of a profile that
// isn't this page is the browser asking who it is, and /api/auth/me answers that.
//
// Four fields, because `User` holds four for a customer. No address book: an
// order's delivery address is captured at checkout and never stored against the
// account (design brief), so there is nothing here to edit.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: pickLocale(locale, "Your details", "اطلاعات شما"),
    // One customer's own contact details — nothing here is for an index, and
    // the guard would turn a crawler away regardless.
    robots: { index: false, follow: false },
  };
}

// `app/[locale]/layout.tsx` sets `revalidate = 300` for the storefront tree.
// Reading the session below already makes this route dynamic, but it's spelled
// out because the failure mode if it ever weren't is serving one customer's
// phone number to everyone out of the cache.
export const dynamic = "force-dynamic";

export default async function AccountProfilePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;

  // `proxy.ts` already turned away anyone without a CUSTOMER token, but that
  // guard is routing convenience running on the edge with no database: it can't
  // know the account was deleted or deactivated since the token was signed.
  const user = await getCurrentUser();
  if (user?.role !== "CUSTOMER") {
    redirect(loginHref(locale, navHref(locale, ACCOUNT_PROFILE_PATH)));
  }

  // Null only if the row went away between the two reads — treated as signed
  // out, because that is what it is.
  const profile = await getCustomerProfile(user.id);
  if (!profile) {
    redirect(loginHref(locale, navHref(locale, ACCOUNT_PROFILE_PATH)));
  }

  const title = pickLocale(locale, "Your details", "اطلاعات شما");

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          { label: title },
        ]}
      />

      <div className="mt-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">
            {title}
          </h1>
          <p className="mt-2 max-w-[60ch] text-[14.5px] text-neutral-500">
            {pickLocale(
              locale,
              "How we reach you about an order, and how you sign in.",
              "راه ارتباط ما با شما درباره‌ی سفارش‌ها، و همان اطلاعاتی که با آن وارد می‌شوید.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={navHref(locale, ACCOUNT_ORDERS_PATH)}
            className="focus-visible:ring-accent inline-flex min-h-9 items-center rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            {pickLocale(locale, "Your orders", "سفارش‌های شما")}
          </Link>
          <SignOutButton locale={locale} />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <AccountProfileForm locale={locale} profile={profile} />
      </div>
    </div>
  );
}
