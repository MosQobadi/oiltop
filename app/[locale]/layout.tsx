import type { Metadata } from "next";
import { Geist, Vazirmatn } from "next/font/google";
import { notFound } from "next/navigation";
import { isLocale, LOCALES, localeDir } from "@/lib/i18n";
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
  title: "Top Oil",
};

// `/en` and `/fa` are the only two trees; prerendering both keeps storefront
// pages static by default (no `headers()` read in the root layout).
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

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

  return (
    <html lang={locale} dir={localeDir(locale)} className={`${font.variable} h-full antialiased`}>
      <body className={`${font.className} flex min-h-full flex-col`}>{children}</body>
    </html>
  );
}
