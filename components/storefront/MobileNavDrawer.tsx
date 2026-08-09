"use client";

import Link from "next/link";
import { Drawer, useOverlayState } from "@heroui/react";
import { MenuIcon } from "./icons";
import { CART_PATH, isNavItemActive, navHref, storefrontNavItems } from "./nav-items";
import { localeDir, pickLocale, type Locale } from "@/lib/i18n";

export function MobileNavDrawer({ locale, pathname }: { locale: Locale; pathname: string }) {
  // Controlled rather than trigger-driven, so tapping a destination can close
  // the drawer itself — including when the destination is the current page and
  // no navigation follows to close it for us.
  const state = useOverlayState();

  const menuLabel = pickLocale(locale, "Menu", "منو");
  const items = [
    ...storefrontNavItems,
    { key: "cart", labelEn: "Cart", labelFa: "سبد خرید", path: CART_PATH },
  ];

  return (
    <Drawer state={state}>
      <Drawer.Trigger
        aria-label={menuLabel}
        data-testid="mobile-nav-trigger"
        className="focus-visible:ring-accent hover:border-accent hover:text-accent inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </Drawer.Trigger>

      <Drawer.Backdrop>
        {/* Slides in from whichever side the reading direction starts on. */}
        <Drawer.Content placement={localeDir(locale) === "rtl" ? "right" : "left"}>
          <Drawer.Dialog>
            <Drawer.Header>
              <Drawer.Heading>{menuLabel}</Drawer.Heading>
              <Drawer.CloseTrigger />
            </Drawer.Header>
            <Drawer.Body>
              <nav aria-label={pickLocale(locale, "Site menu", "منوی سایت")}>
                <ul className="flex flex-col gap-1">
                  {items.map((item) => {
                    const active = isNavItemActive(pathname, locale, item.path);
                    return (
                      <li key={item.key}>
                        <Link
                          href={navHref(locale, item.path)}
                          onClick={state.close}
                          aria-current={active ? "page" : undefined}
                          className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-accent-soft text-accent-soft-foreground"
                              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                          }`}
                        >
                          {pickLocale(locale, item.labelEn, item.labelFa)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}
