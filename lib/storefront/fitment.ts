import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";

// The car-finder's shared vocabulary: how a resolved car travels between pages,
// and how an engine reads once it gets there. The wizard, the results page, the
// PLP banner and the PDP's "fits your car" line all go through here so none of
// them invents its own query key or its own way of writing a year range.

// Design Decision 5: a resolved car is carried as a query param, never baked
// into a canonical URL. `/en/products/mobil1-5w30` stays car-agnostic for SEO;
// `?fit=<carEngineId>` is the context riding alongside it.
export const FIT_PARAM = "fit";

export function withFitContext(href: string, carEngineId: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${FIT_PARAM}=${encodeURIComponent(carEngineId)}`;
}

/** The subset of a car engine needed to write its option label. */
export interface CarEngineLabelParts {
  labelEn: string;
  labelFa: string;
  yearStart: number;
  yearEnd: number | null;
}

// "1.4L TU3 Petrol (2001–2010)". The range is part of the label because two
// engines of one model often differ by nothing else a customer can see, and a
// null `yearEnd` means still in production rather than unknown.
export function formatEngineOptionLabel(locale: Locale, engine: CarEngineLabelParts): string {
  const name = pickLocale(locale, engine.labelEn, engine.labelFa);
  const start = formatDigits(engine.yearStart, locale);
  const end =
    engine.yearEnd === null
      ? pickLocale(locale, "Present", "تاکنون")
      : formatDigits(engine.yearEnd, locale);

  return `${name} (${start}–${end})`;
}
