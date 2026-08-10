import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { FitmentResults } from "@/components/storefront/fitment/FitmentResults";
import { FitmentWizard } from "@/components/storefront/fitment/FitmentWizard";
import { FITMENT_PATH, navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { getActiveCarEngineContext, resolveFitmentForEngine } from "@/lib/services/fitment";
import { FIT_PARAM, formatCarName, formatEngineOptionLabel } from "@/lib/storefront/fitment";
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

  const groups = await resolveFitmentForEngine(car.carEngine.id);
  const carName = formatCarName(locale, car);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        items={[
          homeCrumb,
          { label: fitmentLabel, href: navHref(locale, FITMENT_PATH) },
          { label: carName },
        ]}
      />

      {/* The car stays above the results the whole way down the page — a
          customer scrolling past four categories of parts has to be able to see
          which car they're buying for without scrolling back. */}
      <header className="mt-5 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
        <div className="min-w-0">
          <p className="font-mono text-[10.5px] tracking-[0.09em] text-neutral-500 uppercase">
            {pickLocale(locale, "Parts for your car", "قطعات خودروی شما")}
          </p>
          <h1 className="mt-2 text-[23px] font-semibold tracking-[-0.025em] text-neutral-900">
            {carName}
          </h1>
          <p dir="auto" className="mt-1 text-[14px] text-neutral-500">
            {formatEngineOptionLabel(locale, car.carEngine)}
          </p>
        </div>

        <Link
          href={navHref(locale, FITMENT_PATH)}
          className="focus-visible:ring-accent min-h-11 rounded-[9px] border border-neutral-200 bg-white px-4 py-2.5 text-[13px] font-medium text-neutral-600 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {pickLocale(locale, "Change car", "تغییر خودرو")}
        </Link>
      </header>

      <FitmentResults locale={locale} car={car} groups={groups} className="mt-8" />

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
