"use client";

import { useId, useState } from "react";
import { pickLocale, type Locale } from "@/lib/i18n";
import { buildFitmentRequestMessage, formatSpecAttributes } from "@/lib/storefront/fitment";

// The other half of a fitment result: we know what the car needs, the catalog
// just doesn't carry a match yet. Deliberately *not* error-styled — this is a
// known answer with a get-help path, not a failure — so it reads as an
// informational card (the prototype's blue "Spec known" chip) sitting in the
// same grid as the product cards, with the spec table it does have.
//
// `categoryName` is null for the whole-car case: an engine with no fitment
// profile at all. Same card, same CTA, different heading — a customer who
// picked a car we have no data for needs the request path more than anyone.

export interface SpecOnlyCardProps {
  locale: Locale;
  /** The resolved car, already localized — goes into the request message. */
  carLabel: string;
  categoryName: string | null;
  specNote: string | null;
  /** Free-form `FitmentProfileItem.specAttributes`; shape is proven, not trusted. */
  specAttributes: unknown;
  className?: string;
}

export function SpecOnlyCard({
  locale,
  carLabel,
  categoryName,
  specNote,
  specAttributes,
  className = "",
}: SpecOnlyCardProps) {
  const [requestOpen, setRequestOpen] = useState(false);
  const panelId = useId();

  const rows = formatSpecAttributes(specAttributes);
  const requestMessage = buildFitmentRequestMessage(locale, {
    carLabel,
    categoryName,
    specNote,
    specAttributes,
  });

  const title = categoryName
    ? pickLocale(locale, "We know the spec", "مشخصات را می‌دانیم")
    : pickLocale(locale, "This car isn't matched yet", "این خودرو هنوز تطبیق نشده است");

  const body =
    specNote?.trim() ||
    (categoryName
      ? pickLocale(
          locale,
          "We know what your engine needs, but we don't have a matching product listed right now. Send us the spec and our parts desk will source it.",
          "می‌دانیم موتور شما به چه چیزی نیاز دارد، اما در حال حاضر کالای متناظری در سایت موجود نیست. مشخصات را برای ما بفرستید تا کارشناسان ما آن را تأمین کنند.",
        )
      : pickLocale(
          locale,
          "We don't have a fitment sheet for this car yet. Tell us what you drive and our parts desk will work it out for you.",
          "هنوز اطلاعات تطابق برای این خودرو ثبت نشده است. به ما بگویید چه خودرویی دارید تا کارشناسان ما آن را برایتان مشخص کنند.",
        ));

  return (
    <article
      data-testid="fitment-spec-only-card"
      className={`flex flex-col gap-3 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 ${className}`}
    >
      {categoryName && (
        <span className="inline-flex w-fit items-center rounded-full bg-[oklch(0.96_0.02_240)] px-3 py-1 text-[12.5px] font-medium text-[oklch(0.42_0.1_250)]">
          {pickLocale(
            locale,
            "Spec known — no exact match yet",
            "مشخصات مشخص است — کالای دقیق موجود نیست",
          )}
        </span>
      )}

      <div>
        <h4 className="text-[15px] font-semibold text-neutral-900">{title}</h4>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-neutral-600">{body}</p>
      </div>

      {rows.length > 0 && (
        <dl className="grid gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 bg-white px-3.5 py-2.5">
              <dt className="text-[13px] text-neutral-500">{row.label}</dt>
              <dd
                dir="auto"
                className="text-end font-mono text-[13px] font-medium text-neutral-900"
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={() => setRequestOpen((open) => !open)}
          aria-expanded={requestOpen}
          aria-controls={panelId}
          className="focus-visible:ring-accent border-accent/40 text-accent min-h-11 w-full rounded-[9px] border bg-white px-3 text-[13px] font-medium transition-colors hover:bg-[oklch(0.978_0.011_45)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {categoryName
            ? pickLocale(
                locale,
                "We don't carry this yet — Request it",
                "این را نداریم — درخواست دهید",
              )
            : pickLocale(locale, "Ask us about this car", "درباره‌ی این خودرو بپرسید")}
        </button>

        {requestOpen && (
          <div
            id={panelId}
            className="mt-2.5 rounded-[14px] border border-[oklch(0.9_0.03_45)] bg-[oklch(0.978_0.011_45)] p-4"
          >
            <p className="text-[15px] font-semibold text-neutral-900">
              {pickLocale(locale, "Request this part", "درخواست این قطعه")}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-[oklch(0.42_0.03_45)]">
              {pickLocale(
                locale,
                "Leave a number. A parts advisor confirms price and availability before anything is charged.",
                "شماره تماس خود را بگذارید. کارشناس ما قیمت و موجودی را قبل از هر پرداختی تأیید می‌کند.",
              )}
            </p>
            {/* Task 3.3 mounts the lead form here, pre-filled with this exact
                message (buildFitmentRequestMessage) and POSTing to
                /api/storefront/fitment-inquiries with the car engine and
                category attached. Until then the panel states the request the
                customer is about to make. */}
            <p
              dir="auto"
              className="mt-3 rounded-[10px] border border-[oklch(0.9_0.03_45)] bg-white px-3.5 py-2.5 text-[13px] text-neutral-700"
            >
              {requestMessage}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
