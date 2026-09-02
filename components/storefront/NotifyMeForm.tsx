"use client";

import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pickLocale, type Locale } from "@/lib/i18n";
import { stockNotificationCreateSchema, type StockNotificationCreateInput } from "@/lib/validation";

export interface NotifyMeFormProps {
  locale: Locale;
  /** Product id or slug — the route resolves either. */
  productRef: string;
  /** Focus the input as soon as it renders, for the card's disclosure. */
  autoFocus?: boolean;
  className?: string;
}

// The out-of-stock capture behind Design Decision 9: one field, either an email
// or a phone number, recorded against the product so the admin's Inventory route
// can notify everyone waiting when stock goes back above zero.
//
// It owns its POST rather than taking an `onSubmit` prop — there is exactly one
// endpoint and one shape, and threading a submit handler down from every product
// grid would only give each caller a way to get it wrong.
export function NotifyMeForm({
  locale,
  productRef,
  autoFocus = false,
  className = "",
}: NotifyMeFormProps) {
  const inputId = useId();
  const [submitted, setSubmitted] = useState<"waiting" | "already-in-stock" | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StockNotificationCreateInput>({
    resolver: zodResolver(stockNotificationCreateSchema),
  });

  const onSubmit = async (data: StockNotificationCreateInput) => {
    setFormError(null);

    try {
      const response = await fetch(
        `/api/storefront/products/${encodeURIComponent(productRef)}/notify-me`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );
      const result = await response.json();

      if (!result.success) {
        setFormError(
          pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
        );
        return;
      }

      setSubmitted(result.data.alreadyInStock ? "already-in-stock" : "waiting");
    } catch {
      setFormError(
        pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
      );
    }
  };

  if (submitted) {
    return (
      <p role="status" className={`text-[12.5px] text-fg-muted ${className}`}>
        {submitted === "already-in-stock"
          ? pickLocale(
              locale,
              "Good news — it's back in stock. Refresh to order it.",
              "خبر خوب — دوباره موجود شد. صفحه را تازه کنید.",
            )
          : pickLocale(
              locale,
              "Done. We'll get in touch as soon as it's back.",
              "ثبت شد. به‌محض موجود شدن خبرتان می‌کنیم.",
            )}
      </p>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className={`flex flex-col gap-2 ${className}`}
    >
      <label htmlFor={inputId} className="text-[12.5px] text-fg-muted">
        {pickLocale(locale, "Email or phone", "ایمیل یا شماره تماس")}
      </label>
      <input
        id={inputId}
        autoFocus={autoFocus}
        autoComplete="email"
        aria-invalid={errors.contact ? true : undefined}
        aria-describedby={errors.contact || formError ? `${inputId}-error` : undefined}
        placeholder={pickLocale(locale, "you@example.com", "example@mail.com")}
        className="focus-visible:border-accent focus-visible:ring-accent min-h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus-visible:ring-1 focus-visible:outline-none"
        {...register("contact")}
      />

      {/* The schema's message is English-only (it also serves the API), so the
          form states the rule in the reader's language instead of echoing it. */}
      {(errors.contact || formError) && (
        <p id={`${inputId}-error`} role="alert" className="text-[12.5px] text-danger">
          {formError ??
            pickLocale(
              locale,
              "Enter a valid email address or phone number.",
              "یک ایمیل یا شماره تماس معتبر وارد کنید.",
            )}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="focus-visible:ring-accent bg-accent-solid min-h-11 w-full rounded-[9px] px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {isSubmitting
          ? pickLocale(locale, "Sending…", "در حال ارسال…")
          : pickLocale(locale, "Notify me", "خبرم کن")}
      </button>
    </form>
  );
}
