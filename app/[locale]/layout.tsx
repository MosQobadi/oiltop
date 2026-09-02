import type { Metadata } from "next";
import { Geist, Vazirmatn } from "next/font/google";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/storefront/JsonLd";
import { StorefrontShell } from "@/components/storefront/StorefrontShell";
import { ThemeGuard } from "@/components/storefront/ThemeGuard";
import { isLocale, localeDir } from "@/lib/i18n";
import { siteOrigin } from "@/lib/storefront/sitemap";
import { THEME_INIT_SCRIPT } from "@/lib/storefront/theme";
import { organizationSchema } from "@/lib/storefront/structured-data";
import { getPublicSettings } from "@/server/setting";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  // The origin every relative URL in a page's metadata resolves against. The
  // canonical and hreflang links each page emits are already absolute (see
  // `localeAlternates`), but anything added later — an Open Graph image, say —
  // would otherwise be resolved against localhost in production.
  metadataBase: new URL(siteOrigin()),
  title: "Top Oil",
};

// The shell's header and footer are Settings-driven, which puts a database read
// in every storefront route. That rules out `generateStaticParams`: prerendering
// `/en` and `/fa` would run it at build time, where there is no database (see
// the builder stage in Dockerfile) and where a store name captured once would
// then be frozen into the HTML. Rendering on first request and revalidating
// instead keeps the pages cached without either problem — an admin's Settings
// edit shows up within the window below rather than at the next deploy.
export const revalidate = 300;

// This is a *root* layout, not a nested one — it owns `<html>` so `lang`/`dir`
// can vary per locale, which is why the admin tree lives under its own root
// layout in `app/(admin)/`.
export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  // Anything that isn't a real locale is a 404, not a redirect: `/proudcts` is
  // a typo, and silently sending it to `/en` would give it a 200 for SEO.
  if (!isLocale(locale)) {
    notFound();
  }

  // Only the font the page actually renders in gets loaded — Vazirmatn's Arabic
  // subset is dead weight on the English tree, and vice versa.
  const font = locale === "fa" ? vazirmatn : geistSans;

  // Read once here and passed down, rather than each of the header and footer
  // fetching for itself. This is the same `getPublicSettings()` that backs
  // GET /api/storefront/settings, so the shell and the public route can never
  // disagree about what a customer is allowed to see.
  const settings = await getPublicSettings();

  // Who the site belongs to, stated once for the whole storefront rather than
  // per page — the same store name, contact details and social links the shell
  // renders below, so the markup and the page agree. Null until an admin has
  // set a store name.
  const organization = organizationSchema(settings);

  return (
    // `suppressHydrationWarning` covers exactly one attribute: the `data-theme`
    // the script below sets on this element before React ever sees it. Without
    // it React reports the mismatch it caused itself.
    //
    // Note what is deliberately *not* here: the theme is not part of
    // `className`. React rewrites that attribute whenever it changes — and it
    // changes on every locale switch, because the font variable below is part
    // of it — which silently reset the theme on the way from /en to /fa.
    <html
      lang={locale}
      dir={localeDir(locale)}
      className={`${font.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className={`${font.className} flex min-h-full flex-col`}>
        {/* Before first paint, deliberately: see THEME_INIT_SCRIPT. A Client
            Component cannot do this job — it only runs after hydration, by
            which time the wrong theme has already been on screen. First child
            of <body> so it blocks on the way past, ahead of any markup that
            could be painted in the wrong theme.

            React 19 logs "Encountered a script tag while rendering React
            component" for this in development, and it is not wrong: this runs
            on the initial document and never again, which is precisely why
            ThemeGuard above has to exist. The warning is dev-only and there is
            no placement that avoids it — rendering it only on the server warns
            from the server render instead, and next/script wraps the same
            element. Do not "fix" it by deleting the script; that trades a
            console note for a flash of the wrong theme on every cold load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Renders nothing; restores the theme attribute React strips off
            <html> when a locale switch remounts this layout. */}
        <ThemeGuard />
        {organization && <JsonLd data={organization} />}
        <StorefrontShell locale={locale} settings={settings}>
          {children}
        </StorefrontShell>
      </body>
    </html>
  );
}
