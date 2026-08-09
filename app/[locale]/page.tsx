import { LocaleSwitcher } from "@/components/storefront/LocaleSwitcher";
import { type Locale, pickLocale } from "@/lib/i18n";

// Placeholder home page — the storefront shell (Phase 2) and the real homepage
// (Phase 6) replace this. It exists so `/en` and `/fa` resolve to something.
// The switcher sits here only until Task 2.1 gives it its real home in the
// header; this is the only page that exists to hang it on.
export default async function StorefrontHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <p className="text-sm text-neutral-500">{pickLocale(locale, "Top Oil", "تاپ اویل")}</p>
      <LocaleSwitcher />
    </main>
  );
}
