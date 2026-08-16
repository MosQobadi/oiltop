import Image from "next/image";
import Link from "next/link";
import { CarIcon } from "../icons";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { CarEngineContext } from "@/lib/services/fitment";
import {
  formatCarName,
  formatDisplacement,
  formatEngineOptionLabel,
  formatFuelType,
  variantImage,
} from "@/lib/storefront/fitment";

// The car the finder resolved, standing above its results for the whole page —
// a customer scrolling past five categories of parts has to be able to see
// which car they're buying for without scrolling back.
//
// It leads with the photo because that is the fastest way to confirm "yes, that
// is my car" — faster than reading a type label, which is exactly the string a
// customer is least sure about. `variantImage` is why the photo is nearly
// always there: the type's own picture when it has one, the model's otherwise.
//
// A Server Component: the only interactive thing on it is a link.

export interface FitmentCarCardProps {
  locale: Locale;
  car: CarEngineContext;
  /** Back to the bare wizard — "this isn't my car". */
  changeHref: string;
  className?: string;
}

// Warm, barely-there wash rather than flat white: this is the one panel on the
// page that isn't a product, and it should read as the page's subject.
const CARD_STYLE = {
  backgroundImage: [
    "radial-gradient(120% 140% at 100% 0%, oklch(0.97 0.024 45 / 0.9) 0%, transparent 60%)",
    "linear-gradient(180deg, #fff 0%, oklch(0.99 0.004 60) 100%)",
  ].join(","),
};

// The homepage category card's placeholder, not ProductCard's: the photo here
// is the panel's ground with the car's name written across it, so a car with no
// picture needs a dark hatch that keeps that name readable — a light slot would
// leave white text on white.
const PLACEHOLDER_STYLE = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--color-neutral-700) 0 1px, transparent 1px 10px)",
};

const PHOTO_SIZES = "(min-width: 1024px) 400px, (min-width: 768px) 42vw, 100vw";

export function FitmentCarCard({ locale, car, changeHref, className = "" }: FitmentCarCardProps) {
  const photo = variantImage(car.carEngine, car.carModel);
  const carName = formatCarName(locale, car);

  // The type label is free text an admin wrote — often just "تیپ ۲", sometimes a
  // whole spec string. So the strip below states the structured columns under
  // their own names rather than as loose pills: where the label already said
  // "2.0L Petrol", a labelled row reads as the breakdown of it instead of as
  // the same words a second time.
  const specs = [
    car.carEngine.displacementCc
      ? {
          label: pickLocale(locale, "Engine", "حجم موتور"),
          value: formatDisplacement(locale, car.carEngine.displacementCc),
        }
      : null,
    {
      label: pickLocale(locale, "Fuel", "سوخت"),
      value: formatFuelType(locale, car.carEngine.fuelType),
    },
    car.carEngine.engineCode
      ? { label: pickLocale(locale, "Engine code", "کد موتور"), value: car.carEngine.engineCode }
      : null,
  ].filter((spec): spec is { label: string; value: string } => spec !== null);

  return (
    <header
      data-testid="fitment-car-card"
      style={CARD_STYLE}
      className={`grid overflow-hidden rounded-2xl border border-neutral-200 md:grid-cols-[minmax(0,42%)_minmax(0,1fr)] lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] ${className}`}
    >
      {/* The photo is the panel, not a thumbnail beside one — the same treatment
          the homepage category cards get. Below `md` it's a 2:1 band above the
          details (wider than a category tile's 16:10, because this is a header
          the customer scrolls past, not something to browse); from `md` up it's
          a column with no aspect of its own, so it stretches to exactly the
          height the details beside it come to and the two halves end level. */}
      <div className="relative aspect-[2/1] bg-neutral-900 md:aspect-auto md:min-h-[210px] lg:min-h-[236px]">
        {photo ? (
          // Decorative: the name written across it says which car this is.
          <Image src={photo} alt="" fill sizes={PHOTO_SIZES} className="object-cover" priority />
        ) : (
          <span
            style={PLACEHOLDER_STYLE}
            className="flex h-full w-full items-center justify-center bg-neutral-800 text-neutral-500"
          >
            <CarIcon className="h-14 w-14" />
          </span>
        )}

        {/* Car photography is whatever the admin uploaded — a white studio shot
            as often as a dark one — so the name brings its own contrast rather
            than trusting the image underneath it. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/55 to-transparent"
        />

        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          <p className="font-mono text-[10.5px] tracking-[0.09em] text-white/70 uppercase">
            {pickLocale(locale, "Parts for your car", "قطعات خودروی شما")}
          </p>
          <h1 className="mt-1 text-[25px] leading-tight font-semibold tracking-[-0.025em] text-white">
            {carName}
          </h1>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-4 p-4 sm:p-6">
        <div>
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-neutral-500 uppercase">
            {pickLocale(locale, "Your type", "تیپ شما")}
          </p>
          <p dir="auto" className="mt-1 text-[17px] font-medium text-neutral-900">
            {formatEngineOptionLabel(locale, car.carEngine)}
          </p>
        </div>

        {/* Capped rather than spread across the whole panel: three short values
            strung out over 700px stop reading as one spec table. */}
        <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-3.5 border-t border-neutral-200/80 pt-4 sm:grid-cols-3">
          {specs.map((spec) => (
            <div key={spec.label}>
              <dt className="font-mono text-[10.5px] tracking-[0.08em] text-neutral-500 uppercase">
                {spec.label}
              </dt>
              <dd dir="auto" className="mt-1 text-[14.5px] font-medium text-neutral-800">
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>

        <Link
          href={changeHref}
          className="focus-visible:ring-accent flex min-h-11 w-full items-center justify-center rounded-[9px] border border-neutral-200 bg-white px-4 text-[13px] font-medium text-neutral-600 transition-colors hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-fit"
        >
          {pickLocale(locale, "Change car", "تغییر خودرو")}
        </Link>
      </div>
    </header>
  );
}
