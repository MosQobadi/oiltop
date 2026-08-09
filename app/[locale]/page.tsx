import { type Locale, pickLocale } from "@/lib/i18n";

// Placeholder home page — the real homepage (hero, car-finder wizard, category
// grid) replaces this. It exists so `/en` and `/fa` resolve to something inside
// the shell, which now owns the header, footer and locale switcher.
export default async function StorefrontHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-20 sm:px-6">
      <p className="text-sm text-neutral-500">
        {pickLocale(locale, "Homepage coming soon.", "صفحه‌ی اصلی به‌زودی.")}
      </p>
    </div>
  );
}
