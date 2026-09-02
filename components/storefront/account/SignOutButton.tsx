"use client";

import { navHref } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/auth";

// The storefront's sign-out control. It lives here, on the orders screen, rather
// than in the header — `AccountLink` stays a link, same as the prototype, and
// this is the one screen a signed-in customer is certain to be on.
//
// The store's `logout` takes its destination because it knows no route names:
// the admin chrome sends it to /login, the storefront to this locale's home.

export function SignOutButton({ locale, className = "" }: { locale: Locale; className?: string }) {
  const logout = useAuthStore((state) => state.logout);

  return (
    <button
      type="button"
      data-testid="sign-out"
      onClick={() => void logout(navHref(locale, ""))}
      className={`focus-visible:ring-accent inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${className}`}
    >
      {pickLocale(locale, "Sign out", "خروج از حساب")}
    </button>
  );
}
