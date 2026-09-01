import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { FitmentCarCard } from "@/components/storefront/fitment/FitmentCarCard";
import { OilGuidanceCard } from "@/components/storefront/fitment/OilGuidanceCard";
import { FitmentResults } from "@/components/storefront/fitment/FitmentResults";
import { FitmentWizard } from "@/components/storefront/fitment/FitmentWizard";
import { FITMENT_PATH, navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  getActiveCarEngineContext,
  getOilGuidanceForEngine,
  resolveFitmentForEngine,
} from "@/lib/services/fitment";
import {
  FIT_CATEGORY_PARAM,
  FIT_PARAM,
  formatCarName,
  withFitContext,
} from "@/lib/storefront/fitment";
import { localeAlternates } from "@/lib/storefront/seo";
import { storefrontIdParamSchema } from "@/lib/validation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // `?fit=` picks which of this page's two states renders; it doesn't make a
  // second page, so the canonical is the bare wizard in both.
  return { alternates: localeAlternates(locale, FITMENT_PATH) };
}

// One screen, two states, told apart by `?fit=<carEngineId>` (Design Decision
// 5): no car yet means the wizard, a resolved car means its results. Keeping
// both here is what makes "Change car" a link back to this same page rather
// than a client-side reset, and what makes a results URL shareable.
//
// The data is read through lib/services/fitment directly rather than by fetching
// this app's own /api/storefront/cars/engines/:id/fitment route — same functions
// that route serves, same payload, minus an HTTP round-trip to ourselves. That's
// the pattern app/[locale]/layout.tsx already uses for Settings, and it's what
// lets the results render server-side instead of arriving after a spinner. The
// public route still exists for client callers.

export default async function FitmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const rawFit = (await searchParams)[FIT_PARAM];
  const parsedFit = storefrontIdParamSchema.safeParse(typeof rawFit === "string" ? rawFit : "");

  const car = parsedFit.success ? await getActiveCarEngineContext(parsedFit.data) : null;
  // A `fit` that resolves to nothing is a stale or hand-edited link, not a 404:
  // the page still works, it just has to ask for the car again.
  const staleFit = parsedFit.success && car === null;

  const homeCrumb = { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") };
  const fitmentLabel = pickLocale(locale, "Car Fitment", "تطابق خودرو");

  if (!car) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
        <Breadcrumbs locale={locale} items={[homeCrumb, { label: fitmentLabel }]} />

        <h1 className="mt-5 text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">
          {pickLocale(locale, "Find parts for your car", "قطعات خودروی خود را پیدا کنید")}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[14.5px] text-neutral-500">
          {pickLocale(
            locale,
            "Four taps. No part numbers to look up.",
            "چهار انتخاب. نیازی به شماره فنی نیست.",
          )}
        </p>

        {staleFit && (
          <p
            role="status"
            className="mt-5 max-w-xl rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[13.5px] text-neutral-600"
          >
            {pickLocale(
              locale,
              "We couldn't find that car — it may have been removed. Pick it again below.",
              "آن خودرو پیدا نشد — ممکن است حذف شده باشد. دوباره آن را انتخاب کنید.",
            )}
          </p>
        )}

        <FitmentWizard locale={locale} mode="full" className="mt-6 max-w-xl" />
      </div>
    );
  }

  const [groups, oilGuidance] = await Promise.all([
    resolveFitmentForEngine(car.carEngine.id),
    getOilGuidanceForEngine(car.carEngine.id),
  ]);
  const carName = formatCarName(locale, car);

  // The third state: "See all 44" on a section links back here with the car it
  // already resolved plus a category, and gets that one section uncapped. No
  // second route and no second query — the same resolution, rendered narrower.
  const rawCategory = (await searchParams)[FIT_CATEGORY_PARAM];
  const onlyCategory =
    typeof rawCategory === "string" && rawCategory !== "" ? rawCategory : undefined;
  const onlyCategoryName = onlyCategory
    ? groups.find((group) => group.category.slug === onlyCategory)?.category
    : undefined;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          homeCrumb,
          { label: fitmentLabel, href: navHref(locale, FITMENT_PATH) },
          onlyCategory
            ? {
                label: carName,
                href: withFitContext(navHref(locale, FITMENT_PATH), car.carEngine.id),
              }
            : { label: carName },
          ...(onlyCategoryName
            ? [{ label: pickLocale(locale, onlyCategoryName.nameEn, onlyCategoryName.nameFa) }]
            : []),
        ]}
      />

      <FitmentCarCard
        locale={locale}
        car={car}
        changeHref={navHref(locale, FITMENT_PATH)}
        className="mt-5"
      />

      {/* Above the products, and only on the full view: narrowed to one
          category the customer is comparing filters, not choosing an oil. */}
      {oilGuidance && !onlyCategory && (
        <OilGuidanceCard locale={locale} guidance={oilGuidance} className="mt-4" />
      )}

      {onlyCategory && (
        <p className="mt-6">
          <a
            href={withFitContext(navHref(locale, FITMENT_PATH), car.carEngine.id)}
            className="text-accent text-[13.5px] font-medium hover:underline"
          >
            {pickLocale(
              locale,
              "← Back to everything that fits this car",
              "→ بازگشت به همه‌ی موارد مناسب این خودرو",
            )}
          </a>
        </p>
      )}

      <FitmentResults
        locale={locale}
        car={car}
        groups={groups}
        onlyCategorySlug={onlyCategory}
        className="mt-8"
      />

      <p className="mt-10 max-w-[70ch] text-[12.5px] leading-relaxed text-neutral-500">
        {pickLocale(
          locale,
          "Fitment data is advisory — always confirm against your owner's manual.",
          "اطلاعات تطابق جنبه‌ی راهنما دارد — همیشه با دفترچه‌ی خودرو مطابقت دهید.",
        )}
      </p>
    </div>
  );
}
