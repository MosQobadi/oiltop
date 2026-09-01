import { pickLocale, type Locale } from "@/lib/i18n";
import type { OilGuidance } from "@/lib/services/fitment";

// The "which oil, and why" panel, between the car and its products.
//
// It answers the question a customer actually arrived with. The product grid
// below shows what we sell; this says what the car needs, which is the thing
// they cannot work out from a shelf of bottles. Written per car by someone who
// knows it — see the FitmentProfile comment in schema.prisma for why none of it
// is derived from what we happen to stock.
//
// **Every part is optional and most cars have only some of it.** 571 of 660
// imported cars have no viscosity at all, because the source published the
// block with the slots empty. So each row renders only when it has something to
// say, and a card with nothing to say is not rendered at all — the page never
// prints an empty "Recommended viscosity:" label.
//
// A Server Component: nothing here is interactive.

export interface OilGuidanceCardProps {
  locale: Locale;
  guidance: OilGuidance;
  className?: string;
}

// The three conditions, in the order a customer thinks about them: the answer
// for most of the year first, then the two edges. Matches the STANDARD / HOT /
// COLD columns the product grid below already uses, so the page reads as one
// recommendation rather than two vocabularies.
function conditions(locale: Locale, guidance: OilGuidance) {
  return [
    {
      key: "standard",
      grade: guidance.viscosityStandard,
      label: pickLocale(locale, "All seasons", "تمام فصول"),
      hint: pickLocale(locale, "Iran's climate", "با توجه به دمای ایران"),
    },
    {
      key: "cold",
      grade: guidance.viscosityCold,
      label: pickLocale(locale, "Very cold", "بسیار سرد"),
      hint: null,
    },
    {
      key: "hot",
      grade: guidance.viscosityHot,
      label: pickLocale(locale, "Very hot", "بسیار گرم"),
      hint: null,
    },
  ].filter((row) => row.grade !== null);
}

// Stored in millilitres to match Product.volumeMl; shown in litres, which is
// how the bottle is labelled and how anyone doing the job says it. Trailing
// zeros are trimmed so 3500 reads "3.5" and 4000 reads "4", not "4.0".
function litres(ml: number, locale: Locale): string {
  const value = (ml / 1000).toFixed(1).replace(/\.0$/, "");
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(Number(value));
}

function capacities(locale: Locale, guidance: OilGuidance) {
  return [
    {
      key: "with-filter",
      ml: guidance.capacityWithFilterMl,
      label: pickLocale(locale, "With a new oil filter", "همراه با تعویض فیلتر روغن"),
    },
    {
      key: "no-filter",
      ml: guidance.capacityNoFilterMl,
      label: pickLocale(locale, "Without changing the filter", "بدون تعویض فیلتر روغن"),
    },
  ].filter((row): row is { key: string; ml: number; label: string } => row.ml !== null);
}

export function OilGuidanceCard({ locale, guidance, className = "" }: OilGuidanceCardProps) {
  const rows = conditions(locale, guidance);
  const volumes = capacities(locale, guidance);
  const note = pickLocale(locale, guidance.noteEn, guidance.noteFa) ?? null;
  const hasGrades = guidance.apiGrades.length > 0;

  return (
    <section
      data-testid="oil-guidance"
      aria-labelledby="oil-guidance-heading"
      className={`rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 ${className}`}
    >
      <h2 id="oil-guidance-heading" className="text-[15px] font-semibold text-neutral-900">
        {pickLocale(locale, "Recommended engine oil", "مشخصات پیشنهادی روغن موتور")}
      </h2>

      {rows.length > 0 && (
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          {rows.map((row) => (
            <div
              key={row.key}
              data-testid={`oil-viscosity-${row.key}`}
              className="rounded-xl bg-neutral-50 px-4 py-3"
            >
              {/* The grade leads: it is the string a customer compares against
                  the bottle in their hand. */}
              <dd className="text-accent font-mono text-lg font-semibold tracking-tight">
                {row.grade}
              </dd>
              <dt className="mt-0.5 text-[13px] font-medium text-neutral-700">{row.label}</dt>
              {row.hint && <p className="text-[12px] text-neutral-500">{row.hint}</p>}
            </div>
          ))}
        </dl>
      )}

      {hasGrades && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className="text-[13px] font-medium text-neutral-700">
            {pickLocale(locale, "API standard", "استاندارد پیشنهادی")}
          </span>
          <ul className="flex flex-wrap gap-2">
            {guidance.apiGrades.map((grade) => (
              <li
                key={grade}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 font-mono text-[12.5px] font-medium text-neutral-800"
              >
                {grade}
              </li>
            ))}
          </ul>
        </div>
      )}

      {volumes.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <p className="text-[13px] font-medium text-neutral-700">
            {pickLocale(locale, "How much it takes", "حجم روغن موتور")}
          </p>
          <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
            {volumes.map((row) => (
              <div key={row.key} data-testid={`oil-capacity-${row.key}`} className="flex flex-col">
                <dd className="font-mono text-[15px] font-semibold text-neutral-900">
                  {litres(row.ml, locale)}{" "}
                  <span className="font-sans text-[12.5px] font-normal text-neutral-500">
                    {pickLocale(locale, "L", "لیتر")}
                  </span>
                </dd>
                <dt className="text-[12.5px] text-neutral-500">{row.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      )}

      {note && (
        <p className="mt-4 border-t border-neutral-100 pt-4 text-[13.5px] leading-relaxed text-neutral-600">
          {note}
        </p>
      )}
    </section>
  );
}
