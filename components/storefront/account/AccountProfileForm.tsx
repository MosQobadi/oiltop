"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/storefront/FormField";
import { pickLocale, type Locale } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/auth";
import {
  storefrontProfileUpdateSchema,
  type StorefrontProfileFormValues,
  type StorefrontProfileUpdateInput,
} from "@/lib/validation";

// Name, phone, email — the four columns `User` actually holds for a customer,
// and nothing else. There is no password field: changing a password needs the
// current one and a flow of its own, and no address fields, because an order's
// address is captured per order and never saved (design brief).
//
// The form is seeded from the server-rendered profile rather than from the auth
// store, which knows no phone number and is a mirror of the session rather than
// of the row. It writes the store back on success so the "Signed in as…" line on
// the orders screen doesn't keep showing the old name until the next reload.

export interface AccountProfileFormProps {
  locale: Locale;
  profile: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
}

export function AccountProfileForm({ locale, profile }: AccountProfileFormProps) {
  const router = useRouter();
  const fieldId = useId();
  const setUser = useAuthStore((state) => state.setUser);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<StorefrontProfileFormValues, unknown, StorefrontProfileUpdateInput>({
    resolver: zodResolver(storefrontProfileUpdateSchema),
    // The nullable columns become empty strings: an uncontrolled input can't
    // hold null, and blank is what the schema reads back as "no email".
    defaultValues: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone ?? "",
      email: profile.email ?? "",
    },
  });

  const onSubmit = async (data: StorefrontProfileUpdateInput) => {
    setFormError(null);
    setSaved(false);

    try {
      const response = await fetch("/api/storefront/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!result.success) {
        setFormError(
          // 409 is the only failure the customer can act on, and it can be
          // either identifier — unlike registration, where only the phone is
          // ever sent. The route's message names which, but it is English-only,
          // so the two are told apart by what was submitted.
          response.status === 409
            ? data.email && /email/i.test(String(result.error))
              ? pickLocale(
                  locale,
                  "That email address is already used by another account.",
                  "این ایمیل قبلاً برای حساب دیگری ثبت شده است.",
                )
              : pickLocale(
                  locale,
                  "That number is already used by another account.",
                  "این شماره قبلاً برای حساب دیگری ثبت شده است.",
                )
            : response.status === 401
              ? pickLocale(
                  locale,
                  "Your session has expired. Sign in again to save these changes.",
                  "نشست شما منقضی شده است. برای ذخیره‌ی تغییرات دوباره وارد شوید.",
                )
              : pickLocale(
                  locale,
                  "Something went wrong. Try again.",
                  "خطایی رخ داد. دوباره تلاش کنید.",
                ),
        );
        return;
      }

      setUser(result.data.user);
      // Reset to what the server stored, not to what was typed: `phone` comes
      // back normalized, so this is also what shows the customer the spelling
      // their account now actually holds. It clears `isDirty` too, which is
      // what makes the saved notice disappear again on the next edit.
      reset({
        firstName: result.data.profile.firstName,
        lastName: result.data.profile.lastName,
        phone: result.data.profile.phone ?? "",
        email: result.data.profile.email ?? "",
      });
      setSaved(true);
      // The orders screen's "Signed in as" line is server-rendered from the
      // same row, so the router cache has to be dropped for it to agree.
      router.refresh();
    } catch {
      setFormError(
        pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
      );
    }
  };

  return (
    <form
      noValidate
      data-testid="account-profile-form"
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
          {(props) => <input autoComplete="given-name" {...props} {...register("firstName")} />}
        </Field>

        <Field
          id={`${fieldId}-last-name`}
          label={pickLocale(locale, "Last name", "نام خانوادگی")}
          error={
            errors.lastName &&
            pickLocale(locale, "Enter your last name.", "نام خانوادگی را وارد کنید.")
          }
        >
          {(props) => <input autoComplete="family-name" {...props} {...register("lastName")} />}
        </Field>
      </div>

      <Field
        id={`${fieldId}-phone`}
        label={pickLocale(locale, "Mobile number", "شماره موبایل")}
        hint={pickLocale(
          locale,
          "This is what you sign in with, and the number the courier calls.",
          "با همین شماره وارد می‌شوید و پیک هم با همین شماره تماس می‌گیرد.",
        )}
        error={
          errors.phone &&
          pickLocale(locale, "Enter a valid mobile number.", "یک شماره موبایل معتبر وارد کنید.")
        }
      >
        {(props) => (
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            {...props}
            {...register("phone")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-email`}
        label={pickLocale(locale, "Email (optional)", "ایمیل (اختیاری)")}
        hint={pickLocale(
          locale,
          "Add one and you can sign in with it too. Leave it empty to remove it.",
          "اگر ایمیل اضافه کنید می‌توانید با آن هم وارد شوید. برای حذف، خالی بگذارید.",
        )}
        error={
          errors.email &&
          pickLocale(
            locale,
            "Enter a valid email address, or leave it empty.",
            "یک ایمیل معتبر وارد کنید یا خالی بگذارید.",
          )
        }
      >
        {(props) => (
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            {...props}
            {...register("email")}
          />
        )}
      </Field>

      {formError && (
        <p role="alert" className="text-[12.5px] text-red-600">
          {formError}
        </p>
      )}

      {/* `isDirty` hides it the moment the customer types again, so the notice
          can never sit above a form that no longer matches what was saved. */}
      {saved && !isDirty && !formError && (
        <p role="status" data-testid="profile-saved" className="text-[12.5px] text-green-700">
          {pickLocale(locale, "Your details are saved.", "اطلاعات شما ذخیره شد.")}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="focus-visible:ring-accent bg-accent mt-2 min-h-12 rounded-[11px] px-5 text-[15px] font-medium text-white transition-colors hover:bg-[oklch(0.48_0.16_44)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 sm:self-start"
      >
        {isSubmitting
          ? pickLocale(locale, "Saving…", "در حال ذخیره…")
          : pickLocale(locale, "Save changes", "ذخیره‌ی تغییرات")}
      </button>
    </form>
  );
}
