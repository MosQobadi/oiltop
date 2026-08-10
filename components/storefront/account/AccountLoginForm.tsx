"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/components/storefront/FormField";
import { accountReturnPath } from "@/components/storefront/nav-items";
import { pickLocale, type Locale } from "@/lib/i18n";
import { useAuthStore } from "@/lib/store/auth";
import { loginSchema, type LoginInput } from "@/lib/validation";

// Storefront sign-in. It posts to the same /api/auth/login the admin panel
// uses — one session mechanism for the whole app (design brief Section 6) —
// which is why the credential is a single `identifier` field: a customer
// registered with a phone number and may have added an email since.
//
// `from` is the page the Task 7.2 route guard bounced them off, passed down by
// the page from its own `searchParams` rather than read with
// `useSearchParams()` — this form is the whole reason the screen is dynamic, so
// there is nothing to gain from a Suspense boundary around it.

export function AccountLoginForm({ locale, from }: { locale: Locale; from?: string }) {
  const router = useRouter();
  const fieldId = useId();
  // Set here rather than left to the store's own /api/auth/me hydration, which
  // only runs on a page load — without this the header would still read "Sign
  // in" after a client-side navigation away from this form.
  const setUser = useAuthStore((state) => state.setUser);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (data: LoginInput) => {
    setFormError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (!result.success) {
        // Three outcomes need three different next steps, so they can't share
        // one message: retype the password, wait, or phone the shop. The route
        // separates them by status because its own text is English-only.
        setFormError(
          response.status === 403
            ? pickLocale(
                locale,
                "This account has been deactivated. Contact us and we'll sort it out.",
                "این حساب غیرفعال شده است. با ما تماس بگیرید تا بررسی کنیم.",
              )
            : response.status === 429
              ? pickLocale(
                  locale,
                  "Too many attempts. Wait a few minutes and try again.",
                  "تلاش‌های ناموفق زیاد بوده است. چند دقیقه صبر کنید و دوباره تلاش کنید.",
                )
              : pickLocale(
                  locale,
                  "Those details don't match an account.",
                  "این اطلاعات با هیچ حسابی مطابقت ندارد.",
                ),
        );
        return;
      }

      // The mirror of the admin login form's ADMIN-only check. An admin has no
      // customer data here, and letting the session stand would loop: the
      // account guard would bounce them straight back to this form. So the
      // session it just created is dropped, exactly as the admin form drops a
      // customer's.
      if (result.data.user.role !== "CUSTOMER") {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
        setFormError(
          pickLocale(
            locale,
            "Administrators sign in through the admin panel.",
            "مدیران از طریق پنل مدیریت وارد می‌شوند.",
          ),
        );
        return;
      }

      setUser(result.data.user);

      // refresh() before push so the server components of the page being
      // navigated to are rendered with the new session cookie, not the
      // signed-out render still in the router cache.
      router.refresh();
      router.push(accountReturnPath(from, locale));
    } catch {
      setFormError(
        pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
      );
    }
  };

  return (
    <form
      noValidate
      data-testid="account-login-form"
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-3"
    >
      <Field
        id={`${fieldId}-identifier`}
        label={pickLocale(locale, "Mobile number or email", "شماره موبایل یا ایمیل")}
        error={
          errors.identifier &&
          pickLocale(
            locale,
            "Enter your mobile number or email.",
            "شماره موبایل یا ایمیل خود را وارد کنید.",
          )
        }
      >
        {(props) => (
          <input
            // `username` rather than `tel`: a password manager needs to know
            // this is the account handle, whichever of the two it holds.
            autoComplete="username"
            placeholder={pickLocale(locale, "09xx xxx xxxx", "۰۹xx xxx xxxx")}
            dir="ltr"
            {...props}
            {...register("identifier")}
          />
        )}
      </Field>

      <Field
        id={`${fieldId}-password`}
        label={pickLocale(locale, "Password", "گذرواژه")}
        error={
          errors.password &&
          pickLocale(
            locale,
            "Your password is at least 8 characters.",
            "گذرواژه حداقل ۸ نویسه است.",
          )
        }
      >
        {(props) => (
          <input
            type="password"
            autoComplete="current-password"
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
          ? pickLocale(locale, "Signing in…", "در حال ورود…")
          : pickLocale(locale, "Log in", "ورود")}
      </button>
    </form>
  );
}
