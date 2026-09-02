"use client";

import Link from "next/link";
import { UserIcon } from "../icons";
import { ACCOUNT_ORDERS_PATH, LOGIN_PATH, navHref } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/auth";

// The prototype's header account pill: "Account" once signed in, "Sign in"
// before that, pointing at the two destinations behind those words. It is the
// storefront's reader of `lib/store/auth` — the sign-out control lives on the
// orders screen (Task 9.1), same as the prototype, so this stays a link.
//
// A CUSTOMER is the only role this treats as signed in. An ADMIN's session is
// real but opens no account screen (see `proxy.ts`), so offering them "Account"
// would be a link to a page the guard turns them away from.

export function AccountLink({ locale, className = "" }: { locale: Locale; className?: string }) {
  // `loading` is the store's pre-hydration state, and rendering it as signed
  // out is what keeps the first client pass identical to the server's HTML —
  // the session is only knowable from /api/auth/me, which runs in the browser.
  const user = useAuthStore((state) => state.user);
  const isCustomer = user?.role === "CUSTOMER";

  const label = isCustomer
    ? pickLocale(locale, "Account", "حساب من")
    : pickLocale(locale, "Sign in", "ورود");

  return (
    <Link
      href={navHref(locale, isCustomer ? ACCOUNT_ORDERS_PATH : LOGIN_PATH)}
      // Labelled explicitly, same as the cart trigger, so the name doesn't come
      // and go with the breakpoint that hides the text.
      aria-label={label}
      data-testid="account-link"
      className={`focus-visible:ring-accent hover:border-accent hover:text-accent inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium whitespace-nowrap text-fg-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${className}`}
    >
      <UserIcon className="h-4 w-4" />
      {/* Same treatment as the cart's label: the glyph carries it on a phone,
          where the header has three controls competing for the same row. */}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
