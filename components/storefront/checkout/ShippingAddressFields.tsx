"use client";

import { useId } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { CONTROL_CLASS, Field } from "../FormField";
import { pickLocale, type Locale } from "@/lib/i18n";
import type { StorefrontCheckoutFormValues } from "@/lib/validation";

// Who the courier is delivering to, and where. Collected fresh every order and
// kept nowhere: there is no address book (design brief), so this is a plain form
// rather than a picker with a "save this address" checkbox.
//
// Province, city and street are three fields here and one string in the order —
// see `composeShippingAddress`. Splitting them is a question of how an address
// is written, not of what is stored.

export function ShippingAddressFields({
  locale,
  register,
  errors,
}: {
  locale: Locale;
  register: UseFormRegister<StorefrontCheckoutFormValues>;
  errors: FieldErrors<StorefrontCheckoutFormValues>;
}) {
  const fieldId = useId();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field
        id={`${fieldId}-name`}
        label={pickLocale(locale, "Recipient name", "نام گیرنده")}
        error={
          errors.contactName &&
          pickLocale(
            locale,
            "Enter the name the courier should ask for.",
            "نامی که پیک باید سراغ آن را بگیرد وارد کنید.",
          )
        }
        className="sm:col-span-2"
      >
        {(props) => (
          <input
            autoComplete="name"
            placeholder={pickLocale(locale, "e.g. Sara Ahmadi", "مثلاً سارا احمدی")}
            {...props}
            {...register("contactName")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-phone`}
        label={pickLocale(locale, "Mobile number", "شماره موبایل")}
        hint={pickLocale(locale, "For delivery calls only.", "فقط برای تماس هنگام تحویل.")}
        error={
          errors.contactPhone &&
          pickLocale(locale, "Enter a valid mobile number.", "یک شماره موبایل معتبر وارد کنید.")
        }
      >
        {(props) => (
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder={pickLocale(locale, "09xx xxx xxxx", "۰۹xx xxx xxxx")}
            {...props}
            {...register("contactPhone")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-postal`}
        label={pickLocale(locale, "Postal code", "کد پستی")}
        hint={pickLocale(
          locale,
          "Used by the courier for routing.",
          "برای مسیریابی پیک استفاده می‌شود.",
        )}
        error={
          errors.postalCode &&
          pickLocale(locale, "A postal code is 10 digits.", "کد پستی باید ۱۰ رقم باشد.")
        }
      >
        {(props) => (
          <input
            inputMode="numeric"
            autoComplete="postal-code"
            dir="ltr"
            placeholder={pickLocale(locale, "10 digits", "۱۰ رقم")}
            {...props}
            {...register("postalCode")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-province`}
        label={pickLocale(locale, "Province", "استان")}
        error={errors.province && pickLocale(locale, "Enter your province.", "استان را وارد کنید.")}
      >
        {(props) => (
          <input
            autoComplete="address-level1"
            placeholder={pickLocale(locale, "Tehran", "تهران")}
            {...props}
            {...register("province")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-city`}
        label={pickLocale(locale, "City", "شهر")}
        error={errors.city && pickLocale(locale, "Enter your city.", "شهر را وارد کنید.")}
      >
        {(props) => (
          <input
            autoComplete="address-level2"
            placeholder={pickLocale(locale, "Tehran", "تهران")}
            {...props}
            {...register("city")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-street`}
        label={pickLocale(locale, "Full address", "آدرس کامل")}
        error={
          errors.street &&
          pickLocale(
            locale,
            "Add the street, number and unit — enough for the courier to find you.",
            "خیابان، پلاک و واحد را بنویسید — به اندازه‌ای که پیک شما را پیدا کند.",
          )
        }
        className="sm:col-span-2"
      >
        {(props) => (
          <textarea
            rows={3}
            autoComplete="street-address"
            placeholder={pickLocale(
              locale,
              "Street, number, unit, and any landmark that helps the courier.",
              "خیابان، پلاک، واحد و نشانی کمکی برای پیک.",
            )}
            {...props}
            className={`${CONTROL_CLASS} resize-y`}
            {...register("street")}
          />
        )}
      </Field>
    </div>
  );
}
