"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/storefront/FormField";
import { ACCOUNT_ORDERS_PATH, navHref } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import {
  storefrontRegisterSchema,
  type StorefrontRegisterFormValues,
  type StorefrontRegisterInput,
} from "@/lib/validation";

// Storefront sign-up (Design Decision 7): phone is the credential, email is
// not asked for at all. A customer who wants one adds it on the profile screen
// (Task 9.2) — the schema keeps it optional for exactly that, and asking for it
// here would put a field in front of every new customer that none of them need.
//
// The name is two fields rather than the prototype's single "Full name",
// because `User` stores firstName/lastName separately and splitting a typed
// string on a space guesses wrong often enough to be worth not doing.

export function AccountRegisterForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const fieldId = useId();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StorefrontRegisterFormValues, unknown, StorefrontRegisterInput>({
    resolver: zodResolver(storefrontRegisterSchema),
    defaultValues: { firstName: "", lastName: "", phone: "", password: "" },
  });

  const onSubmit = async (data: StorefrontRegisterInput) => {
    setFormError(null);

    try {
      const response = await fetch("/api/storefront/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!result.success) {
        setFormError(
          // 409 is the only failure a customer can act on, and the only
          // identifier this form sends is the phone number.
          response.status === 409
            ? pickLocale(
                locale,
                "That number already has an account. Log in instead.",
                "این شماره قبلاً ثبت شده است. وارد شوید.",
              )
            : response.status === 429
              ? pickLocale(
                  locale,
                  "Too many attempts. Wait a few minutes and try again.",
                  "تلاش‌های زیادی انجام شده است. چند دقیقه صبر کنید و دوباره تلاش کنید.",
                )
              : pickLocale(
                  locale,
                  "Something went wrong. Try again.",
                  "خطایی رخ داد. دوباره تلاش کنید.",
                ),
        );
        return;
      }

      // The route signs the new account in, so this lands on the same screen
      // as a login rather than sending the customer back to type it all again.
      router.refresh();
      router.push(navHref(locale, ACCOUNT_ORDERS_PATH));
    } catch {
      setFormError(
        pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
      );
    }
  };

  return (
    <form
      noValidate
      data-testid="account-register-form"
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${fieldId}-first-name`}
          label={pickLocale(locale, "First name", "نام")}
          error={
            errors.firstName && pickLocale(locale, "Enter your first name.", "نام را وارد کنید.")
          }
        >
          {(props) => (
            <input
              autoComplete="given-name"
              placeholder={pickLocale(locale, "Sara", "سارا")}
              {...props}
              {...register("firstName")}
            />
          )}
        </Field>

        <Field
          id={`${fieldId}-last-name`}
          label={pickLocale(locale, "Last name", "نام خانوادگی")}
          error={
            errors.lastName &&
            pickLocale(locale, "Enter your last name.", "نام خانوادگی را وارد کنید.")
          }
        >
          {(props) => (
            <input
              autoComplete="family-name"
              placeholder={pickLocale(locale, "Ahmadi", "احمدی")}
              {...props}
              {...register("lastName")}
            />
          )}
        </Field>
      </div>

      <Field
        id={`${fieldId}-phone`}
        label={pickLocale(locale, "Mobile number", "شماره موبایل")}
        error={
          errors.phone &&
          pickLocale(
            locale,
            "Enter a valid mobile number — it's how you'll sign in.",
            "یک شماره موبایل معتبر وارد کنید — با همین شماره وارد می‌شوید.",
          )
        }
      >
        {(props) => (
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={pickLocale(locale, "09xx xxx xxxx", "۰۹xx xxx xxxx")}
            dir="ltr"
            {...props}
            {...register("phone")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-password`}
        label={pickLocale(locale, "Password", "گذرواژه")}
        error={
          errors.password &&
          pickLocale(locale, "Use at least 8 characters.", "گذرواژه باید حداقل ۸ نویسه داشته باشد.")
        }
      >
        {(props) => (
          <input
            type="password"
            autoComplete="new-password"
            placeholder={pickLocale(locale, "At least 8 characters", "حداقل ۸ نویسه")}
            {...props}
            {...register("password")}
          />
        )}
      </Field>

      {formError && (
        <p role="alert" className="text-[12.5px] text-red-600">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="focus-visible:ring-accent bg-accent mt-2 min-h-12 w-full rounded-[11px] px-4 text-[15px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        {isSubmitting
          ? pickLocale(locale, "Creating account…", "در حال ساخت حساب…")
          : pickLocale(locale, "Register", "ثبت‌نام")}
      </button>
    </form>
  );
}
