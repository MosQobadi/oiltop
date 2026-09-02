import Link from "next/link";
import { FITMENT_PATH, navHref } from "../nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { formatCarName, formatEngineOptionLabel, withFitContext } from "@/lib/storefront/fitment";
import type { CarContextParts } from "@/lib/storefront/fitment";

// The answer to the question a customer arrives with when they come from the
// car finder: does this one fit my car? The PLP carries `?fit=` as a banner
// because a whole grid can't be answered that way; the PDP is one product, so
// here it's a verdict and it sits next to the buy button.
//
// Two states, and neither of them says "incompatible". A product is listed here
// because a Fitment Profile recommends it for this engine — the absence of that
// link means we haven't matched it, which is not the same claim as "it won't
// fit", and the catalog is nowhere near complete enough to make the stronger one.

export interface FitsYourCarNoticeProps {
  locale: Locale;
  car: CarContextParts & { carEngine: { id: string } };
  fits: boolean;
  className?: string;
}

export function FitsYourCarNotice({ locale, car, fits, className = "" }: FitsYourCarNoticeProps) {
  const carName = formatCarName(locale, car);

  if (fits) {
    return (
      <div
        data-testid="fits-your-car"
        data-fits="true"
        className={`rounded-xl border border-success/30 bg-success-soft px-4 py-3 ${className}`}
      >
        <p className="text-[14px] font-medium text-success">
          {pickLocale(locale, `Fits your ${carName}`, `مناسب ${carName} شما`)}
        </p>
        <p dir="auto" className="mt-0.5 text-[13px] text-success">
          {formatEngineOptionLabel(locale, car.carEngine)}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="fits-your-car"
      data-fits="false"
      className={`rounded-xl border border-line bg-surface-sunken px-4 py-3 ${className}`}
    >
      <p className="text-[14px] font-medium text-fg">
        {pickLocale(locale, `Not matched to your ${carName}`, `برای ${carName} شما ثبت نشده است`)}
      </p>
      <p className="mt-0.5 text-[13px] text-fg-muted">
        {pickLocale(
          locale,
          "We haven't listed this part for your car — that doesn't rule it out, but we can't confirm it either.",
          "این قطعه برای خودروی شما ثبت نشده است — یعنی نامناسب بودنش قطعی نیست، اما تأییدش هم نمی‌کنیم.",
        )}
      </p>
      <Link
        href={withFitContext(navHref(locale, FITMENT_PATH), car.carEngine.id)}
        className="focus-visible:ring-accent text-accent mt-1.5 inline-flex min-h-11 items-center rounded text-[13px] font-medium transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {pickLocale(locale, "See what does fit", "ببینید چه چیزی مناسب است")}
      </Link>
    </div>
  );
}
