"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/storefront/FormField";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  storefrontFitmentInquiryCreateSchema,
  type StorefrontFitmentInquiryCreateInput,
  type StorefrontFitmentInquiryFormValues,
} from "@/lib/validation";

// The car finder's get-help path: the catalog has no product for this car yet,
// so instead of a dead end the customer leaves a name and a number and the
// parts desk picks it up as a Fitment Inquiry.
//
// It validates with `storefrontFitmentInquiryCreateSchema` — the same schema the
// POST route runs — so the client can't pass something the server then rejects,
// and a rule only ever has to change in one place. `carEngineId`/`categoryId`
// ride along as default values rather than rendered fields: they're context the
// customer never types, but they belong in the payload the schema checks.

export interface RequestItFormProps {
  locale: Locale;
  /** The resolved car, when the customer got here through the wizard. */
  carEngineId: string | null;
  /** The category that had no match; null for the whole-car case. */
  categoryId: string | null;
  /** Pre-filled message — the spec the customer is asking for. */
  defaultMessage: string;
  /** Lets the card keep the confirmation on screen instead of collapsing it. */
  onSubmitted?: () => void;
  className?: string;
}

export function RequestItForm({
  locale,
  carEngineId,
  categoryId,
  defaultMessage,
  onSubmitted,
  className = "",
}: RequestItFormProps) {
  const fieldId = useId();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StorefrontFitmentInquiryFormValues, unknown, StorefrontFitmentInquiryCreateInput>({
    resolver: zodResolver(storefrontFitmentInquiryCreateSchema),
    defaultValues: {
      customerName: "",
      phone: "",
      email: "",
      message: defaultMessage,
      carEngineId: carEngineId ?? "",
      categoryId: categoryId ?? "",
    },
  });

  const onSubmit = async (data: StorefrontFitmentInquiryCreateInput) => {
    setFormError(null);

    try {
      const response = await fetch("/api/storefront/fitment-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!result.success) {
        // The route rate-limits per IP, and "you already sent one" needs a
        // different answer than "that didn't work" — otherwise a customer
        // retries into the same wall.
        setFormError(
          response.status === 429
            ? pickLocale(
                locale,
                "You've sent a few requests already. Give it a minute and try again.",
                "چند درخواست پشت سر هم ثبت شده است. کمی صبر کنید و دوباره تلاش کنید.",
              )
            : pickLocale(
                locale,
                "Something went wrong. Try again.",
                "خطایی رخ داد. دوباره تلاش کنید.",
              ),
        );
        return;
      }

      setSubmitted(true);
      onSubmitted?.();
    } catch {
      setFormError(
        pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
      );
    }
  };

  // A confirmation panel, not a toast: it says what we have, who acts on it and
  // when, and it stays on the page (design brief — "a graceful get-help path").
  if (submitted) {
    return (
      <div
        role="status"
        className={`rounded-[10px] border border-[oklch(0.9_0.03_45)] bg-white p-4 ${className}`}
      >
        <p className="text-[14.5px] font-semibold text-neutral-900">
          {pickLocale(
            locale,
            "We got it — our team will reach out.",
            "ثبت شد — با شما تماس می‌گیریم.",
          )}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
          {pickLocale(
            locale,
            "A parts advisor will call you about this request, usually within one working day. Nothing is ordered and nothing is charged until you confirm with them.",
            "کارشناس ما معمولاً ظرف یک روز کاری درباره‌ی این درخواست با شما تماس می‌گیرد. تا زمانی که تأیید نکنید، سفارشی ثبت و مبلغی دریافت نمی‌شود.",
          )}
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      data-testid="request-it-form"
      onSubmit={handleSubmit(onSubmit)}
      className={`flex flex-col gap-3 ${className}`}
    >
      <Field
        id={`${fieldId}-name`}
        label={pickLocale(locale, "Your name", "نام شما")}
        error={
          errors.customerName && pickLocale(locale, "Enter your name.", "نام خود را وارد کنید.")
        }
      >
        {(props) => <input autoComplete="name" {...props} {...register("customerName")} />}
      </Field>

      <Field
        id={`${fieldId}-phone`}
        label={pickLocale(locale, "Phone", "شماره تماس")}
        error={
          errors.phone &&
          pickLocale(
            locale,
            "Enter a phone number we can reach you on.",
            "یک شماره تماس معتبر وارد کنید.",
          )
        }
      >
        {(props) => (
          <input type="tel" inputMode="tel" autoComplete="tel" {...props} {...register("phone")} />
        )}
      </Field>

      <Field
        id={`${fieldId}-email`}
        label={pickLocale(locale, "Email (optional)", "ایمیل (اختیاری)")}
        error={
          errors.email &&
          pickLocale(locale, "Enter a valid email address.", "یک ایمیل معتبر وارد کنید.")
        }
      >
        {(props) => (
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            {...props}
            {...register("email")}
          />
        )}
      </Field>

      {/* Pre-filled with the spec, and editable — the message is the customer's
          chance to add what the spec table can't say ("it's the estate, not the
          hatch"). */}
      <Field
        id={`${fieldId}-message`}
        label={pickLocale(locale, "What you need (optional)", "توضیحات (اختیاری)")}
        error={
          errors.message &&
          pickLocale(locale, "That message is too long.", "متن پیام بیش از حد طولانی است.")
        }
      >
        {(props) => <textarea rows={3} dir="auto" {...props} {...register("message")} />}
      </Field>

      {formError && (
        <p role="alert" className="text-[12.5px] text-red-600">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="focus-visible:ring-accent bg-accent min-h-11 w-full rounded-[9px] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {isSubmitting
          ? pickLocale(locale, "Sending…", "در حال ارسال…")
          : pickLocale(locale, "Send request", "ارسال درخواست")}
      </button>
    </form>
  );
}
