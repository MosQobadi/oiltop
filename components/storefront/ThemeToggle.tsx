"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { pickLocale, type Locale } from "@/lib/i18n";
import { applyTheme, readAppliedTheme, type ThemeChoice } from "@/lib/storefront/theme";

// One button, two states. A three-way light/dark/system control is more honest
// about where the initial value comes from, but it needs a menu to express, and
// this sits in a header row that already carries an account link, a cart and a
// language switcher.
//
// System preference is still respected — the inline script in the layout reads
// it on first visit. What a click does is *stop* following the system and pin a
// choice, which is the behaviour someone reaching for this control is asking
// for anyway.

// The class on <html> is the source of truth, and it is written by a script
// outside React — so it is an external store, and reading it as one is what
// keeps the server render (which cannot know the answer) and the client render
// (which can) from disagreeing. React uses `getServerSnapshot` for the markup
// and for hydration, then re-renders with the real value; no effect, no
// mismatch, and no flash of the wrong glyph.
//
// The MutationObserver is not decoration: it is what re-renders this button
// after `applyTheme` mutates the class, and it would also catch the class being
// changed by anything else on the page.
const subscribeToThemeClass = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};

const noThemeOnServer = () => null;

export function ThemeToggle({ locale }: { locale: Locale }) {
  const theme = useSyncExternalStore<ThemeChoice | null>(
    subscribeToThemeClass,
    readAppliedTheme,
    noThemeOnServer,
  );

  const next: ThemeChoice = theme === "dark" ? "light" : "dark";

  const label = pickLocale(
    locale,
    next === "dark" ? "Switch to dark theme" : "Switch to light theme",
    next === "dark" ? "تغییر به حالت تیره" : "تغییر به حالت روشن",
  );

  return (
    <button
      type="button"
      // Named for what it controls rather than what it currently shows, so a
      // screen reader announces a stable control with a changing state.
      aria-label={label}
      title={label}
      aria-pressed={theme === "dark"}
      data-testid="theme-toggle"
      onClick={() => applyTheme(next)}
      className="focus-visible:ring-accent hover:bg-surface-muted flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
    >
      {/* Until the effect has run there is no icon, only the button's own
          outline — the same size and position it will keep, so nothing shifts
          when the glyph arrives. */}
      {theme === null ? null : theme === "dark" ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
    </button>
  );
}
