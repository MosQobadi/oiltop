import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/storefront/Breadcrumbs";
import { CARS_PATH, FITMENT_PATH, navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  getActiveCarBrandBySlug,
  listCarModelSummariesForBrand,
  type CarModelSummary,
} from "@/lib/services/fitment";
import { formatTypeCount, formatYearSpan } from "@/lib/storefront/fitment";
import { localeAlternates } from "@/lib/storefront/seo";
import { carBrandSlugParamSchema } from "@/lib/validation";

// The car half of the catalog's crawlable surface (admin Design Decision 7):
// somebody searching "Peugeot engine oil" is looking for a page about Peugeots,
// not for step one of a wizard. This one is an index — its job is to name every
// model we hold fitment data for and hand each of them its own URL.
//
// No wizard here on purpose. A brand alone doesn't narrow the cascade enough to
// be worth embedding (the customer would still answer three steps), and the
// model links below are the better next click. The full finder is one link away.

export default async function CarBrandPage({
  params,
}: {
  params: Promise<{ locale: Locale; brandSlug: string }>;
}) {
  const { locale, brandSlug } = await params;
  const carBrand = await findCarBrand(brandSlug);
  // Unknown or deactivated is a 404, not an empty page — the sitemap stops
  // listing a deactivated brand, and this has to agree with it.
  if (!carBrand) notFound();

  const models = await listCarModelSummariesForBrand(carBrand.id);
  const brandName = pickLocale(locale, carBrand.nameEn, carBrand.nameFa);

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
          { label: brandName },
        ]}
      />

      <header className="mt-5 flex flex-wrap items-center gap-5">
        {carBrand.logo && (
          <div className="relative size-[72px] shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            {/* Decorative: the heading beside it already names the brand. */}
            <Image src={carBrand.logo} alt="" fill sizes="72px" className="object-contain p-2.5" />
          </div>
        )}

        <div className="min-w-0">
          <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-neutral-900">
            {pickLocale(locale, `${brandName} oil and filters`, `روغن و فیلتر ${brandName}`)}
          </h1>
          <p className="mt-2 max-w-[62ch] text-[14.5px] text-pretty text-neutral-500">
            {pickLocale(
              locale,
              `Pick your ${brandName} model to see the engine oil and filters it was built for.`,
              `مدل ${brandName} خود را انتخاب کنید تا روغن موتور و فیلترهایی که برای آن ساخته شده‌اند را ببینید.`,
            )}
          </p>
        </div>
      </header>

      {models.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center">
          <p className="text-[15px] font-medium text-neutral-900">
            {pickLocale(
              locale,
              "No models are listed for this brand yet.",
              "هنوز مدلی برای این برند ثبت نشده است.",
            )}
          </p>
          <Link
            href={navHref(locale, FITMENT_PATH)}
            className="focus-visible:ring-accent text-accent mt-3 inline-flex min-h-11 items-center rounded text-[13.5px] font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Try the car finder", "امتحان کردن جست‌وجوی خودرو")}
          </Link>
        </div>
      ) : (
        <>
          <h2 className="mt-9 text-[15px] font-semibold tracking-[-0.01em] text-neutral-900">
            {pickLocale(locale, "Models", "مدل‌ها")}
          </h2>

          <ul
            data-testid="car-model-list"
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {models.map((model) => (
              <li key={model.id}>
                <CarModelLink
                  locale={locale}
                  brandSlug={carBrand.slug}
                  brandName={brandName}
                  model={model}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// The whole card is one link rather than a card with a link in it: there's only
// one thing to do with a model here, and a 44px-tall target beats a text link.
function CarModelLink({
  locale,
  brandSlug,
  brandName,
  model,
}: {
  locale: Locale;
  brandSlug: string;
  brandName: string;
  model: CarModelSummary;
}) {
  const modelName = pickLocale(locale, model.nameEn, model.nameFa);

  return (
    <Link
      href={navHref(locale, `${CARS_PATH}/${brandSlug}/${model.slug}`)}
      className="focus-visible:ring-accent flex h-full items-center gap-3.5 rounded-2xl border border-neutral-200 bg-white p-3.5 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {model.image && (
        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
          <Image src={model.image} alt="" fill sizes="56px" className="object-cover" />
        </div>
      )}

      <div className="min-w-0">
        <p className="text-[14.5px] font-medium text-neutral-900">
          {brandName} {modelName}
        </p>
        {/* A model with no types listed yet has no span to state — its page
            still exists, it just can't say what years it covers. */}
        <p className="mt-0.5 text-[12.5px] text-neutral-500">
          {model.span
            ? `${formatYearSpan(locale, model.span)} · ${formatTypeCount(locale, model.engineCount)}`
            : pickLocale(locale, "Types coming soon", "تیپ‌ها به‌زودی")}
        </p>
      </div>
    </Link>
  );
}

// `generateMetadata` and the page both need the row, and Prisma has no
// per-request dedupe of its own — `cache` keeps it to one query.
const findCarBrand = cache(async (brandSlug: string) => {
  const parsed = carBrandSlugParamSchema.safeParse(brandSlug);
  // A segment that can't be a slug can't match a row either; skip the query.
  if (!parsed.success) return null;
  return getActiveCarBrandBySlug(parsed.data);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale; brandSlug: string }>;
}): Promise<Metadata> {
  const { locale, brandSlug } = await params;
  const carBrand = await findCarBrand(brandSlug);
  // The page 404s; there's nothing to describe.
  if (!carBrand) return {};

  const brandName = pickLocale(locale, carBrand.nameEn, carBrand.nameFa);

  // Unlike CarModel, CarBrand carries no SEO pair in the schema — the admin's
  // Car Brands form is name, slug, logo and status. So both tags are written
  // from the brand's own name rather than left blank.
  return {
    alternates: localeAlternates(locale, `${CARS_PATH}/${carBrand.slug}`),
    title: pickLocale(
      locale,
      `${brandName} engine oil and filters`,
      `روغن موتور و فیلتر ${brandName}`,
    ),
    description: pickLocale(
      locale,
      `Engine oil, oil filters, air filters and cabin filters for every ${brandName} model we carry. Pick your model, year and engine.`,
      `روغن موتور، فیلتر روغن، فیلتر هوا و فیلتر کابین برای همه‌ی مدل‌های ${brandName}. مدل، سال و موتور خود را انتخاب کنید.`,
    ),
  };
}
