"use client";

import { useId } from "react";
import { pickLocale, type Locale } from "@/lib/i18n";

// The storefront's one quantity control: the PDP's buy box asks for it before
// anything is in the cart, every cart line asks for it after. Same three
// affordances (−, a typed number, +) and the same clamping in both places; the
// only thing that differs is the ceiling — the PDP knows a product is in stock
// but not by how much, the cart line knows exactly.
//
// Clamping happens here on the way out, so no caller receives a value outside
// [min, max] and none of them has to re-check the NaN an emptied number input
// produces.

export interface QuantityStepperProps {
  locale: Locale;
  value: number;
  /** Always called with a whole number inside [min, max]. */
  onChange: (quantity: number) => void;
  max: number;
  min?: number;
  disabled?: boolean;
  /**
   * Which line this stepper belongs to, for screen readers — a cart page has
   * one per product, and three controls all called "Quantity" name nothing.
   */
  itemLabel?: string;
  className?: string;
}

const BUTTON_CLASS =
  "focus-visible:ring-accent inline-flex size-11 shrink-0 items-center justify-center rounded-[9px] text-[17px] leading-none text-fg-muted transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:outline-none disabled:text-fg-faint disabled:hover:bg-transparent";

export function QuantityStepper({
  locale,
  value,
  onChange,
  max,
  min = 1,
  disabled = false,
  itemLabel,
  className = "",
}: QuantityStepperProps) {
  const inputId = useId();

  const quantityLabel = pickLocale(locale, "Quantity", "تعداد");
  const label = itemLabel ? `${quantityLabel} — ${itemLabel}` : quantityLabel;

  // A value above `max` is a real state on the cart page — stock dropped after
  // the item went in — so it renders as stored and is only corrected once the
  // customer touches the control. Clamping on render would silently rewrite the
  // very quantity the warning next to it is about.
  const change = (next: number) => {
    const whole = Number.isFinite(next) ? Math.trunc(next) : min;
    onChange(Math.min(Math.max(whole, min), max));
  };

  return (
    <div
      className={`flex items-center gap-1 rounded-[11px] border border-line bg-surface p-1 ${className}`}
    >
      <button
        type="button"
        onClick={() => change(value - 1)}
        disabled={disabled || value <= min}
        aria-label={pickLocale(locale, "Decrease quantity", "کاهش تعداد")}
        aria-controls={inputId}
        className={BUTTON_CLASS}
      >
        <span aria-hidden="true">−</span>
      </button>

      {/* A real number input, not a label between two buttons: entering "12"
          beats twelve taps, and it's what a keyboard user expects here. */}
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => change(Number.parseInt(event.target.value, 10))}
        className="focus-visible:ring-accent w-12 [appearance:textfield] rounded-[7px] border-0 bg-transparent py-2 text-center text-[14px] font-medium text-fg focus-visible:ring-2 focus-visible:outline-none disabled:text-fg-faint [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <button
        type="button"
        onClick={() => change(value + 1)}
        disabled={disabled || value >= max}
        aria-label={pickLocale(locale, "Increase quantity", "افزایش تعداد")}
        aria-controls={inputId}
        className={BUTTON_CLASS}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
