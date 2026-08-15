import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { CarModelFitmentSummary } from "@/components/storefront/cars/CarModelFitmentSummary";
import { FitmentWizard } from "@/components/storefront/fitment/FitmentWizard";
import { CARS_PATH, FITMENT_PATH, navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { getActiveCarModelBySlugs, getCarModelFitment } from "@/lib/services/fitment";
import { formatTypeCount, formatYearSpan } from "@/lib/storefront/fitment";
import { firstFilled, localeAlternates } from "@/lib/storefront/seo";
import { carBrandSlugParamSchema, carModelSlugParamSchema } from "@/lib/validation";

// A page about one car, not a step in a wizard (admin Design Decision 7). Three
// things in the order somebody arriving from a search wants them:
//
//   1. what this car is — its name, its production span, the admin's own copy;
//   2. the answer, where we have one that holds across the range: a fitment
//      profile shared by enough of the model's engines to be stated as the
//      model's own recommendation, written out as text (Task 10.3's point —
//      that answer must be readable, not only reachable through four selects);
//   3. the wizard, already scoped to this model, for the customer whose exact
//      year and engine matter.
//
// The recommendation deliberately precedes the wizard: a reader who searched
// "BMW X6 engine oil" came for the answer, and the precision tool is what they
// reach for second.

export default async function CarModelPage({
  params,
}: {
  params: Promise<{ locale: Locale; brandSlug: string; modelSlug: string }>;
}) {
  const { locale, brandSlug, modelSlug } = await params;
  const context = await findCarModel(brandSlug, modelSlug);
  // Unknown, deactivated, or a model under a deactivated brand — all 404, the
  // same rule the sitemap's query applies before it lists this URL.
  if (!context) notFound();

  const { carModel, carBrand } = context;
  const fitment = await getCarModelFitment(carModel.id);

  const brandName = pickLocale(locale, carBrand.nameEn, carBrand.nameFa);
  const modelName = pickLocale(locale, carModel.nameEn, carModel.nameFa);
  const carName = `${brandName} ${modelName}`;

  // CarModel holds one bilingual prose pair — the meta description (the admin's
  // Car Models form has no separate body copy). It is the model's description in
  // both senses, so it's rendered here as well as emitted in the page head
  // rather than leaving the page with nothing to say about the car. `firstFilled`
  // rather than a null check: an untouched BilingualTextField stores "".
  const description = firstFilled(
    pickLocale(locale, carModel.metaDescriptionEn, carModel.metaDescriptionFa),
  );

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-10 sm:px-6">
      <Breadcrumbs
        locale={locale}
        structuredData
        items={[
          { label: pickLocale(locale, "Home", "خانه"), href: navHref(locale, "") },
          {
            label: pickLocale(locale, "Car Fitment", "تطابق خودرو"),
            href: navHref(locale, FITMENT_PATH),
          },
          { label: brandName, href: navHref(locale, `${CARS_PATH}/${carBrand.slug}`) },
          { label: modelName },
        ]}
      />

      <div
        className={`mt-5 grid items-center gap-6 ${
          carModel.image ? "sm:grid-cols-[minmax(0,1fr)_260px]" : ""
        }`}
      >
        <div>
          <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">
            {pickLocale(locale, `${carName} oil and filters`, `روغن و فیلتر ${carName}`)}
          </h1>

          {fitment.span && (
            <p className="mt-2 text-[14px] text-neutral-500">
              {formatYearSpan(locale, fitment.span)} ·{" "}
              {formatTypeCount(locale, fitment.engines.length)}
            </p>
          )}

          {description && (
            <p className="mt-3 max-w-[62ch] text-[14.5px] text-pretty text-neutral-500">
              {description}
            </p>
          )}
        </div>

        {carModel.image && (
          <div className="relative h-[150px] overflow-hidden rounded-2xl bg-neutral-100">
            {/* Decorative: the heading beside it already names the car. */}
            <Image
              src={carModel.image}
              alt=""
              fill
              sizes="(min-width: 640px) 260px, 100vw"
              className="object-cover"
              priority
            />
          </div>
        )}
      </div>

      {fitment.sharedProfiles.length > 0 && (
        <div className="mt-8 flex flex-col gap-5">
          {fitment.sharedProfiles.map((profile) => (
            <CarModelFitmentSummary
              key={profile.id}
              locale={locale}
              modelName={carName}
              profile={profile}
            />
          ))}
        </div>
      )}

      <section className="mt-9">
        <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-neutral-900">
          {pickLocale(
            locale,
            `Find the exact match for your ${modelName}`,
            `تطابق دقیق برای ${modelName} خود را پیدا کنید`,
          )}
        </h2>
        <p className="mt-1.5 max-w-[60ch] text-[14px] text-neutral-500">
          {pickLocale(
            locale,
            "Two taps — we already know the car.",
            "دو انتخاب — خودرو را از قبل می‌دانیم.",
          )}
        </p>

        {/* Scoped, so the wizard opens at Year instead of asking a customer to
            name the car whose page they are standing on. Keyed on the model
            because React reconciles two model pages as the same component —
            without it, a year picked here would survive the next model. */}
        <FitmentWizard
          key={carModel.id}
          locale={locale}
          mode="compact"
          scope={{ carModelId: carModel.id }}
          className="mt-5 max-w-xl"
        />
      </section>

      <p className="mt-10 max-w-[70ch] text-[12.5px] leading-relaxed text-neutral-500">
        {pickLocale(
          locale,
          "Fitment data is advisory — always confirm against your owner's manual.",
          "اطلاعات تطابق جنبه‌ی راهنما دارد — همیشه با دفترچه‌ی خودرو مطابقت دهید.",
        )}{" "}
        <Link
          href={navHref(locale, `${CARS_PATH}/${carBrand.slug}`)}
          className="focus-visible:ring-accent hover:text-accent rounded underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none"
        >
          {pickLocale(locale, `All ${brandName} models`, `همه‌ی مدل‌های ${brandName}`)}
        </Link>
      </p>
    </div>
  );
}

// `generateMetadata` and the page both need the row, and Prisma has no
// per-request dedupe of its own — `cache` keeps it to one query.
const findCarModel = cache(async (brandSlug: string, modelSlug: string) => {
  const parsedBrand = carBrandSlugParamSchema.safeParse(brandSlug);
  const parsedModel = carModelSlugParamSchema.safeParse(modelSlug);
  // A segment that can't be a slug can't match a row either; skip the query.
  if (!parsedBrand.success || !parsedModel.success) return null;
  return getActiveCarModelBySlugs(parsedBrand.data, parsedModel.data);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; brandSlug: string; modelSlug: string }>;
}): Promise<Metadata> {
  const { locale, brandSlug, modelSlug } = await params;
  const context = await findCarModel(brandSlug, modelSlug);
  // The page 404s; there's nothing to describe.
  if (!context) return {};

  const { carModel, carBrand } = context;
  const carName = `${pickLocale(locale, carBrand.nameEn, carBrand.nameFa)} ${pickLocale(
    locale,
    carModel.nameEn,
    carModel.nameFa,
  )}`;

  // The admin's meta pair is optional, so the car's own name stands in — an
  // unoptimised <title> beats a blank one.
  return {
    // Same slug pair in both trees (Design Decision 2).
    alternates: localeAlternates(locale, `${CARS_PATH}/${carBrand.slug}/${carModel.slug}`),
    title: firstFilled(
      pickLocale(locale, carModel.metaTitleEn, carModel.metaTitleFa),
      pickLocale(locale, `${carName} engine oil and filters`, `روغن موتور و فیلتر ${carName}`),
    ),
    description: firstFilled(
      pickLocale(locale, carModel.metaDescriptionEn, carModel.metaDescriptionFa),
      pickLocale(
        locale,
        `The engine oil, oil filter, air filter and cabin filter your ${carName} was built for. Pick your year and engine to see exact matches.`,
        `روغن موتور، فیلتر روغن، فیلتر هوا و فیلتر کابینی که ${carName} شما برای آن ساخته شده است. سال و موتور خود را انتخاب کنید.`,
      ),
    ),
  };
}
