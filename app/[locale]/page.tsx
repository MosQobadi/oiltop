import { FitmentWizard } from "@/components/storefront/fitment/FitmentWizard";
import { CategoryBrowseSection } from "@/components/storefront/home/CategoryBrowseSection";
import { TrustStrip } from "@/components/storefront/home/TrustStrip";
import { pickLocale, type Locale } from "@/lib/i18n";
import { listActiveCategories } from "@/lib/services/catalog";
import { getPublicSettings } from "@/server/setting";

// The homepage is the car-finder with a sentence of context around it: the
// wizard is the product's headline interaction, so it sits in the hero itself
// rather than below a marketing block a customer has to scroll past.
//
// Three sections, in the order a customer decides things: find my car, browse
// instead, reach a human. No best-sellers rail and no brand wall yet — those
// need catalog data this page doesn't fetch, and Task 3.4 doesn't ask for them.
//
// Data is read through the service layer directly rather than through this app's
// own /api/storefront routes, the same as app/[locale]/fitment/page.tsx and the
// layout's Settings read: same functions those routes serve, minus an HTTP
// round-trip to ourselves.

// Warm near-black from the prototype's hero, and the accent-tinted glow over it.
const HERO_STYLE = {
  backgroundColor: "oklch(0.24 0.012 55)",
  backgroundImage: "radial-gradient(120% 90% at 80% 0%, oklch(0.32 0.03 45) 0%, transparent 60%)",
};

export default async function StorefrontHome({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const [categories, settings] = await Promise.all([listActiveCategories(), getPublicSettings()]);

  return (
    <>
      <section style={HERO_STYLE} className="text-white">
        <div className="mx-auto grid w-full max-w-[1180px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_minmax(0,460px)] lg:items-center lg:gap-12 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-[12px] text-white/80">
              <span aria-hidden="true" className="bg-accent size-1.5 rounded-full" />
              {pickLocale(locale, "The right oil, the first time.", "روغن درست، همان بار اول.")}
            </span>

            <h1 className="mt-5 max-w-[15ch] text-[30px] leading-[1.12] font-semibold tracking-[-0.03em] text-pretty sm:text-[38px]">
              {pickLocale(locale, "Find parts for your car", "قطعات خودروی خود را پیدا کنید")}
            </h1>

            <p className="mt-4 max-w-[46ch] text-[15px] text-pretty text-white/70 sm:text-[16px]">
              {pickLocale(
                locale,
                "Tell us what you drive. We match the exact viscosity, spec and filter your engine was built for.",
                "بگویید چه خودرویی دارید. ما دقیقاً همان گرانروی، استاندارد و فیلتری را پیدا می‌کنیم که موتور شما برایش ساخته شده است.",
              )}
            </p>

            <p className="mt-4 font-mono text-[12px] tracking-[0.04em] text-white/50">
              {pickLocale(
                locale,
                "Four taps. No part numbers to look up.",
                "چهار انتخاب. نیازی به شماره فنی نیست.",
              )}
            </p>
          </div>

          {/* The wizard keeps its own white card — on this background it reads as
              the one thing on the page you're meant to touch. */}
          <FitmentWizard locale={locale} mode="compact" />
        </div>
      </section>

      <CategoryBrowseSection locale={locale} categories={categories} />

      <TrustStrip locale={locale} settings={settings} />
    </>
  );
}
