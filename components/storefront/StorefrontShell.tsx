import type { ReactNode } from "react";
import { StorefrontFooter } from "./StorefrontFooter";
import { StorefrontHeader } from "./StorefrontHeader";
import type { Locale } from "@/lib/i18n";
import type { PublicSettings } from "@/server/setting";

// Everything the storefront chrome needs comes in as props: the layout does the
// one Settings read and this stays a pure composition, so a page can never
// trigger a second one by rendering the header itself.
export function StorefrontShell({
  locale,
  settings,
  children,
}: {
  locale: Locale;
  settings: PublicSettings;
  children: ReactNode;
}) {
  // Settings ships with an empty store name until an admin fills it in, and a
  // nameless header is worse than a placeholder one.
  const storeName = settings.storeName.trim() || "Top Oil";

  return (
    <>
      <StorefrontHeader locale={locale} storeName={storeName} />
      <main className="flex-1">{children}</main>
      <StorefrontFooter locale={locale} settings={{ ...settings, storeName }} />
    </>
  );
}
