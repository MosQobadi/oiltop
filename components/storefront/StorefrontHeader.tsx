"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountLink } from "./account/AccountLink";
import { MiniCart } from "./cart/MiniCart";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { isNavItemActive, navHref, storefrontNavItems } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";
import { pickLocale, type Locale } from "@/lib/i18n";

export function StorefrontHeader({ locale, storeName }: { locale: Locale; storeName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1180px] items-center gap-4 px-4 sm:px-6">
        <MobileNavDrawer locale={locale} pathname={pathname} />

        <Link
          href={navHref(locale, "")}
          className="focus-visible:ring-accent shrink-0 rounded text-lg font-semibold tracking-tight text-fg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {storeName}
        </Link>

        {/* Below md the same destinations live in the drawer, so this is
            hidden rather than wrapped — a second row would push the whole
            page down on every phone. */}
        <nav aria-label={pickLocale(locale, "Primary", "اصلی")} className="hidden md:block">
          <ul className="flex items-center gap-6">
            {storefrontNavItems.map((item) => {
              const active = isNavItemActive(pathname, locale, item.path);
              return (
                <li key={item.key}>
                  <Link
                    href={navHref(locale, item.path)}
                    aria-current={active ? "page" : undefined}
                    className={`focus-visible:ring-accent hover:text-accent rounded text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none ${
                      active ? "text-accent font-medium" : "text-fg-muted"
                    }`}
                  >
                    {pickLocale(locale, item.labelEn, item.labelFa)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ms-auto flex shrink-0 items-center gap-2">
          <AccountLink locale={locale} />

          {/* Opens the mini-cart rather than navigating — the panel carries the
              link to /cart, and the mobile drawer lists it too, so the full
              page is one predictable step away at every width. */}
          <MiniCart locale={locale} />
          <ThemeToggle locale={locale} />
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  );
}
