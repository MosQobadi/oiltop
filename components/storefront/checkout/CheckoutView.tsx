"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useIsHydrated } from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckoutSummary } from "./CheckoutSummary";
import { DeliveryMethodField } from "./DeliveryMethodField";
import { ShippingAddressFields } from "./ShippingAddressFields";
import { CART_PATH, CHECKOUT_CONFIRMATION_PATH, navHref, PRODUCTS_PATH } from "../nav-items";
import { useCartLines } from "../cart/useCartLines";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { cartBlockingReason } from "@/lib/storefront/cart";
import { toOrderPayload, type PlacedOrder } from "@/lib/storefront/checkout";
import { DELIVERY_METHODS } from "@/lib/storefront/delivery";
import { useCartStore } from "@/lib/store/cart";
import { useOrderConfirmationStore } from "@/lib/store/order-confirmation";
import {
  storefrontCheckoutFormSchema,
  type StorefrontCheckoutFormInput,
  type StorefrontCheckoutFormValues,
} from "@/lib/validation";

// Checkout, in one page rather than a wizard. The order needs seven fields and
// a delivery choice; splitting that across three routes would add navigation to
// a form that fits on one screen, and the design's three step pills are what
// they are in the prototype — markers for the sections below, and for the
// gateway that comes after this page.
//
// It reads the same `useCartLines` the cart screen does, so availability is
// re-checked here too: a customer who left the tab open overnight gets the same
// verdict on this screen as on that one, and `canCheckout` is the same rule.
// The server re-checks all of it regardless (Task 8.2) — this is what keeps a
// rejection from being the first the customer hears of it.

export function CheckoutView({ locale }: { locale: Locale }) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const { lines, subtotal, loading, failed, canCheckout } = useCartLines();
  const clearCart = useCartStore((state) => state.clear);
  const setPlacedOrder = useOrderConfirmationStore((state) => state.setOrder);

  // Survives the moment between "the order exists" and the confirmation route
  // rendering: the cart is emptied as soon as it's been ordered, and without
  // this the screen would flash its empty state on the way out.
  const [placed, setPlaced] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StorefrontCheckoutFormValues, unknown, StorefrontCheckoutFormInput>({
    resolver: zodResolver(storefrontCheckoutFormSchema),
    defaultValues: {
      contactName: "",
      contactPhone: "",
      province: "",
      city: "",
      street: "",
      postalCode: "",
      deliveryMethod: DELIVERY_METHODS[0],
    },
  });

  const deliveryMethod = watch("deliveryMethod");

  const onSubmit = async (values: StorefrontCheckoutFormInput) => {
    setSubmitError(null);

    // Read straight from the store rather than from `lines`: this is the list
    // the order is built from, and it must be the store's current one even if a
    // render is in flight.
    const items = useCartStore.getState().items;
    if (items.length === 0) return;

    try {
      const response = await fetch("/api/storefront/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toOrderPayload(values, items)),
      });
      const result = await response.json();

      if (!result.success) {
        setSubmitError(submitErrorMessage(response.status, locale));
        return;
      }

      // Order matters: the guard goes up before the cart is emptied, and the
      // confirmation's data is in place before the route that reads it.
      setPlaced(true);
      setPlacedOrder(result.data as PlacedOrder);
      clearCart();
      // `replace`, not `push` — going back from a receipt should not land on a
      // checkout form for a cart that has already been ordered.
      router.replace(navHref(locale, CHECKOUT_CONFIRMATION_PATH));
    } catch {
      setSubmitError(
        pickLocale(locale, "Something went wrong. Try again.", "خطایی رخ داد. دوباره تلاش کنید."),
      );
    }
  };

  if (!isHydrated) {
    return (
      <>
        <CheckoutHeading locale={locale} />
        <p role="status" className="mt-6 text-[14px] text-fg-subtle">
          {pickLocale(locale, "Loading your cart…", "در حال بارگذاری سبد خرید…")}
        </p>
      </>
    );
  }

  if (placed) {
    return (
      <>
        <CheckoutHeading locale={locale} />
        <p role="status" className="mt-6 text-[14px] text-fg-subtle">
          {pickLocale(
            locale,
            "Order placed — taking you to your confirmation…",
            "سفارش ثبت شد — در حال انتقال به صفحه‌ی تأیید…",
          )}
        </p>
      </>
    );
  }

  if (lines.length === 0) {
    return (
      <>
        <CheckoutHeading locale={locale} />
        <div className="mt-6 rounded-2xl border border-line bg-surface px-5 py-12 text-center">
          <p className="text-[15px] font-medium text-fg">
            {pickLocale(locale, "There's nothing to check out.", "چیزی برای تسویه وجود ندارد.")}
          </p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13.5px] text-fg-subtle">
            {pickLocale(
              locale,
              "Your cart is empty — add an oil or a filter and come back.",
              "سبد خرید شما خالی است — یک روغن یا فیلتر اضافه کنید و بازگردید.",
            )}
          </p>
          <Link
            href={navHref(locale, PRODUCTS_PATH)}
            className="focus-visible:ring-accent bg-accent-solid mt-5 inline-flex min-h-11 items-center rounded-[9px] px-5 text-[14px] font-medium text-white transition-colors hover:bg-accent-solid-hover focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {pickLocale(locale, "Browse products", "مشاهده‌ی محصولات")}
          </Link>
        </div>
      </>
    );
  }

  const cartHref = navHref(locale, CART_PATH);
  const note = submitError
    ? {
        text: submitError,
        tone: "error" as const,
        link: { href: cartHref, label: pickLocale(locale, "Back to cart", "بازگشت به سبد خرید") },
      }
    : blockingNote({ locale, loading, failed, cartHref, lines });

  return (
    <>
      <CheckoutHeading locale={locale} />

      <CheckoutSteps locale={locale} />

      <form
        noValidate
        data-testid="checkout-form"
        onSubmit={handleSubmit(onSubmit)}
        className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8"
      >
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-fg">
              {pickLocale(locale, "Shipping address", "آدرس تحویل")}
            </h2>
            <p className="mt-1 text-[13px] text-fg-subtle">
              {pickLocale(
                locale,
                "Collected fresh for each order — nothing is stored between orders.",
                "برای هر سفارش تازه پرسیده می‌شود؛ آدرسی ذخیره نمی‌شود.",
              )}
            </p>
            <div className="mt-4">
              <ShippingAddressFields locale={locale} register={register} errors={errors} />
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5">
            <DeliveryMethodField locale={locale} field={register("deliveryMethod")} />
          </section>

          {/* The gateway is a later phase. Saying so plainly beats a disabled
              "Pay now" control that implies a step this build doesn't have. */}
          <section className="rounded-2xl border border-dashed border-line-strong bg-surface-sunken p-5">
            <p className="font-mono text-[10.5px] tracking-[0.06em] text-fg-subtle uppercase">
              {pickLocale(locale, "Payment", "پرداخت")}
            </p>
            <h2 className="mt-2 text-[15.5px] font-semibold tracking-[-0.015em] text-fg">
              {pickLocale(locale, "Payment gateway (placeholder)", "درگاه پرداخت (جای‌نما)")}
            </h2>
            <p className="mt-1.5 max-w-[56ch] text-[13.5px] leading-relaxed text-fg-muted">
              {pickLocale(
                locale,
                "Placing the order hands off to the bank gateway. The order is created as Pending / Unpaid, and the payment callback flips payment status to Paid — fulfilment status is not affected by the callback.",
                "با ثبت سفارش به درگاه بانکی منتقل می‌شوید. سفارش با وضعیت «در انتظار / پرداخت‌نشده» ساخته می‌شود و بازگشت از درگاه فقط وضعیت پرداخت را به «پرداخت‌شده» تغییر می‌دهد؛ وضعیت ارسال مستقل است.",
              )}
            </p>
          </section>
        </div>

        <CheckoutSummary
          locale={locale}
          lines={lines}
          subtotal={subtotal}
          deliveryMethod={deliveryMethod}
          disabled={!canCheckout}
          submitting={isSubmitting}
          note={note}
        />
      </form>
    </>
  );
}

function CheckoutHeading({ locale }: { locale: Locale }) {
  return (
    <h1 className="text-[27px] font-semibold tracking-[-0.025em] text-fg">
      {pickLocale(locale, "Checkout", "تسویه حساب")}
    </h1>
  );
}

// The prototype's three pills. They mark where the customer is in the whole
// purchase, not a stepper this page navigates — the first two are on this
// screen, the third is the gateway that follows it.
function CheckoutSteps({ locale }: { locale: Locale }) {
  const steps = [
    { label: pickLocale(locale, "Address", "آدرس"), current: true },
    { label: pickLocale(locale, "Delivery", "ارسال"), current: true },
    { label: pickLocale(locale, "Payment", "پرداخت"), current: false },
  ];

  return (
    <ol
      className="mt-5 flex flex-wrap gap-2"
      aria-label={pickLocale(locale, "Checkout steps", "مراحل تسویه")}
    >
      {steps.map((step, index) => (
        <li
          key={step.label}
          aria-current={step.current ? "step" : undefined}
          className={`flex items-center gap-2.5 rounded-full border py-1.5 ps-2 pe-3.5 ${
            step.current
              ? "border-accent/25 bg-accent-soft"
              : "border-line bg-surface"
          }`}
        >
          <span
            className={`flex size-5 items-center justify-center rounded-full font-mono text-[10.5px] ${
              step.current ? "bg-accent-solid text-white" : "bg-line text-fg-subtle"
            }`}
          >
            {formatDigits(index + 1, locale)}
          </span>
          <span
            className={`text-[13px] font-medium ${
              step.current ? "text-fg" : "text-fg-subtle"
            }`}
          >
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function submitErrorMessage(status: number, locale: Locale): string {
  // 409 is the catalog moving under a cart that was fine when it loaded — the
  // server's own message is English-only (it also serves the API), so the
  // reason is said again here in the reader's language.
  if (status === 409) {
    return pickLocale(
      locale,
      "Something in your cart changed while you were here — an item is no longer available in the quantity you asked for. Your cart is untouched; review it and try again.",
      "در همین فاصله چیزی در سبد خرید شما تغییر کرد — یکی از اقلام به تعداد درخواستی موجود نیست. سبد خرید شما دست‌نخورده است؛ آن را بررسی کنید و دوباره تلاش کنید.",
    );
  }

  if (status === 429) {
    return pickLocale(
      locale,
      "Too many orders from this connection. Wait a few minutes and try again.",
      "سفارش‌های زیادی از این اتصال ثبت شده است. چند دقیقه صبر کنید و دوباره تلاش کنید.",
    );
  }

  return pickLocale(
    locale,
    "We couldn't place your order. Nothing was charged — try again.",
    "ثبت سفارش ممکن نشد. مبلغی کسر نشده است — دوباره تلاش کنید.",
  );
}

// Why "Place order" is unavailable. Same three cart problems the cart screen
// names, but every fix lives back there, so each one carries the link.
function blockingNote({
  locale,
  loading,
  failed,
  cartHref,
  lines,
}: {
  locale: Locale;
  loading: boolean;
  failed: boolean;
  cartHref: string;
  lines: Parameters<typeof cartBlockingReason>[0];
}) {
  const backToCart = {
    href: cartHref,
    label: pickLocale(locale, "Back to cart", "بازگشت به سبد خرید"),
  };

  if (failed) {
    return {
      text: pickLocale(
        locale,
        "We couldn't check availability just now, so ordering is on hold.",
        "بررسی موجودی در این لحظه ممکن نشد، بنابراین ثبت سفارش متوقف است.",
      ),
      tone: "error" as const,
      link: backToCart,
    };
  }

  if (loading) {
    return {
      text: pickLocale(locale, "Checking availability…", "در حال بررسی موجودی…"),
      tone: "neutral" as const,
    };
  }

  if (cartBlockingReason(lines) !== null) {
    return {
      text: pickLocale(
        locale,
        "An item in your cart can't be ordered right now. Fix it in your cart to continue.",
        "یکی از اقلام سبد خرید در حال حاضر قابل سفارش نیست. برای ادامه آن را در سبد خرید اصلاح کنید.",
      ),
      tone: "error" as const,
      link: backToCart,
    };
  }

  return null;
}
