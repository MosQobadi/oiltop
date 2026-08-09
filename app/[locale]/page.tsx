import { type Locale, pickLocale } from "@/lib/i18n";

// Placeholder home page — the storefront shell (Phase 2) and the real homepage
// (Phase 6) replace this. It exists so `/en` and `/fa` resolve to something.
export default async function StorefrontHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;

  return (
    <main className="flex flex-1 items-center justify-center">
      <p className="text-sm text-neutral-500">{pickLocale(locale, "Top Oil", "تاپ اویل")}</p>
    </main>
  );
}
