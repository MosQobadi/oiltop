"use client";

import { useParams } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, type Locale } from ".";

// Client-side counterpart to the `params.locale` a Server Component reads from
// its props: anything under `app/[locale]/` can call this instead of threading
// the locale down through props.
//
// Kept in its own module (rather than the `lib/i18n` barrel) so Server
// Components importing `pickLocale` don't pull a "use client" module into their
// graph.
//
// The fallback covers the one case `app/[locale]/layout.tsx` can't: a client
// component rendered outside the storefront tree, where there is no `[locale]`
// segment at all.
export function useLocale(): Locale {
  const { locale } = useParams<{ locale?: string }>();
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}
