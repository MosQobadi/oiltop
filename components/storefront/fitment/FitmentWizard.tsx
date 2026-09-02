"use client";

import { useCallback, useId, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFitmentWizard, type FitmentStepKey, type FitmentWizardScope } from "./useFitmentWizard";
import { FITMENT_PATH, navHref } from "../nav-items";
import { SelectMenu, type SelectMenuOption } from "../SelectMenu";
import { formatDigits, pickLocale, type Locale } from "@/lib/i18n";
import { formatEngineOptionLabel, withFitContext } from "@/lib/storefront/fitment";

// The headline interaction: Brand → Model → Year → Type, four public list
// endpoints, one resolved car engine at the end of it. The last step is named
// "Type" (تیپ) for the customer and `engine` in the code — see the step below.
//
// The resolved engine is handed to the URL, not to a store. `?fit=<id>` is what
// the results page (Task 3.2), the PLP banner and the PDP's "fits your car"
// line all read (Design Decision 5), so a customer's car is shareable,
// bookmarkable and survives a reload — none of which a Zustand store gives for
// free. The in-progress selections stay local: nobody links to a half-answered
// wizard, and putting them in the URL would round-trip the server per step.
//
// Neither mode renders a heading. The homepage hero (Task 3.4) and the fitment
// page each own their own copy, and a built-in title would collide with it.

export type FitmentWizardMode = "compact" | "full";

/**
 * The ground the card sits on. `dark` is the homepage hero, where the banner is
 * near-black and a white card would be a hole in the middle of it. Only the
 * card, its four controls and their notes change — the layout is identical.
 */
export type FitmentWizardTone = "light" | "dark";

export interface FitmentWizardProps {
  locale: Locale;
  /**
   * `compact` is the homepage widget — one card, steps side by side.
   * `full` is the fitment page — a numbered stepper with room to breathe.
   */
  mode?: FitmentWizardMode;
  /** Defaults to `light`. Only the homepage hero passes `dark`. */
  tone?: FitmentWizardTone;
  /**
   * Drops the steps the surrounding page has already answered — a car model
   * page starts the customer at Year. See `FitmentWizardScope` for the `key`
   * this asks of a caller whose scope can change in place.
   */
  scope?: FitmentWizardScope;
  /** Overrides the default navigation to `/{locale}/fitment?fit=<carEngineId>`. */
  onResolve?: (carEngineId: string) => void;
  className?: string;
}

interface StepView {
  key: FitmentStepKey;
  label: string;
  placeholder: string;
  value: string;
  options: SelectMenuOption[];
  /** Its own input isn't answered yet, so there is nothing to choose from. */
  disabled: boolean;
  /** Puts a search box in the menu — see the brand step on why only it has one. */
  searchable?: boolean;
  /** Nothing came back — shown only once the step is usable and settled. */
  emptyMessage: string;
  onChange: (value: string) => void;
}

export function FitmentWizard({
  locale,
  mode = "full",
  tone = "light",
  scope,
  onResolve,
  className = "",
}: FitmentWizardProps) {
  const router = useRouter();
  const baseId = useId();

  const handleResolve = useCallback(
    (carEngineId: string) => {
      if (onResolve) {
        onResolve(carEngineId);
        return;
      }
      router.push(withFitContext(navHref(locale, FITMENT_PATH), carEngineId));
    },
    [onResolve, router, locale],
  );

  const wizard = useFitmentWizard(handleResolve, scope);
  const { brands, models, years, engines, selection, flags } = wizard;

  const steps: StepView[] = [
    {
      key: "brand",
      label: pickLocale(locale, "Car brand", "برند خودرو"),
      placeholder: pickLocale(locale, "Select a brand", "برند را انتخاب کنید"),
      value: selection.brandSlug,
      options: brands.map((brand) => ({
        value: brand.slug,
        label: pickLocale(locale, brand.nameEn, brand.nameFa),
        // Searchable in both languages regardless of which tree the customer is
        // on: plenty of people reading the Persian storefront reach for a Latin
        // keyboard to type "peugeot", and the reverse happens on /en too.
        searchText: `${brand.nameFa} ${brand.nameEn}`,
      })),
      disabled: false,
      // The only step long enough to need one — the import brought in 85 car
      // brands, and scrolling past all of them to find yours is the slowest
      // part of the wizard. Model, Year and Type are each scoped to the answer
      // above them and stay short.
      searchable: true,
      emptyMessage: pickLocale(locale, "No car brands listed yet.", "هنوز برندی ثبت نشده است."),
      onChange: wizard.selectBrand,
    },
    {
      key: "model",
      label: pickLocale(locale, "Model", "مدل"),
      placeholder: pickLocale(locale, "Select a model", "مدل را انتخاب کنید"),
      value: selection.modelId,
      options: models.map((model) => ({
        value: model.id,
        label: pickLocale(locale, model.nameEn, model.nameFa),
      })),
      disabled: !selection.brandSlug,
      emptyMessage: pickLocale(
        locale,
        "No models listed for this brand yet.",
        "هنوز مدلی برای این برند ثبت نشده است.",
      ),
      onChange: wizard.selectModel,
    },
    {
      key: "year",
      label: pickLocale(locale, "Year", "سال"),
      placeholder: pickLocale(locale, "Select a year", "سال را انتخاب کنید"),
      value: selection.year,
      options: years.map((year) => ({ value: String(year), label: formatDigits(year, locale) })),
      disabled: !selection.modelId,
      emptyMessage: pickLocale(
        locale,
        "No years listed for this model yet.",
        "هنوز سالی برای این مدل ثبت نشده است.",
      ),
      onChange: wizard.selectYear,
    },
    {
      // "Type" (تیپ), not "Engine": the step key, the state field and the id it
      // resolves to all stay `engine`/`carEngineId` — only what a customer reads
      // changes. A 206 owner knows they have a تیپ ۲, not a TU3.
      key: "engine",
      label: pickLocale(locale, "Type", "تیپ"),
      placeholder: pickLocale(locale, "Select a type", "تیپ را انتخاب کنید"),
      value: selection.carEngineId,
      options: engines.map((engine) => ({
        value: engine.id,
        label: formatEngineOptionLabel(locale, engine),
      })),
      disabled: !selection.year,
      emptyMessage: pickLocale(
        locale,
        "No types listed for that year.",
        "برای آن سال تیپی ثبت نشده است.",
      ),
      onChange: wizard.selectEngine,
    },
  ];

  // Two reasons a step doesn't render, both rendering decisions rather than
  // data ones: the page it's embedded in already answered it, or its answer
  // turned out to be the only one there is — by which point the wizard has
  // already resolved on the year.
  const scopedOut: FitmentStepKey[] = scope ? ["brand", "model"] : [];
  const visibleSteps = steps.filter(
    (step) => !scopedOut.includes(step.key) && !(wizard.engineStepSkipped && step.key === "engine"),
  );

  const renderStep = (step: StepView, index: number) => {
    const stepFlags = flags[step.key];
    const noteId = `${baseId}-${step.key}-note`;
    const note = renderNote({ locale, step, flags: stepFlags, noteId, onRetry: wizard.retry, tone });

    const field = (
      <div className="flex flex-col gap-1.5">
        <SelectMenu
          locale={locale}
          tone={tone}
          testId={`fitment-select-${step.key}`}
          label={step.label}
          value={step.value}
          // The placeholder is the first entry rather than a true placeholder,
          // as it was as an empty <option>: picking it again is how a customer
          // backs a step out.
          options={[{ value: "", label: step.placeholder }, ...step.options]}
          isSearchable={step.searchable}
          isDisabled={step.disabled || stepFlags.loading}
          describedBy={note ? noteId : undefined}
          onChange={step.onChange}
        />
        {note}
      </div>
    );

    if (mode === "compact") {
      return (
        <div key={step.key} data-testid={`fitment-step-${step.key}`}>
          {field}
        </div>
      );
    }

    const done = step.value !== "";
    return (
      <li key={step.key} data-testid={`fitment-step-${step.key}`} className="flex gap-3 sm:gap-4">
        <span
          aria-hidden="true"
          className={`mt-6 flex size-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold ${
            done
              ? "bg-accent text-white"
              : step.disabled
                ? "bg-neutral-100 text-neutral-400"
                : "border border-neutral-300 bg-white text-neutral-600"
          }`}
        >
          {formatDigits(index + 1, locale)}
        </span>
        <div className="min-w-0 flex-1">{field}</div>
      </li>
    );
  };

  // A panel on the hero rather than a card on the page: translucent white over
  // the banner's own ground, so the light behind it still reads through. It's
  // still the one thing on the banner you're meant to touch — that now comes
  // from being the only bordered, blurred surface there, not from being white.
  const cardTone =
    tone === "dark"
      ? "border-white/12 bg-white/6 backdrop-blur-md"
      : "border-neutral-200 bg-white";

  const cardClass = `rounded-2xl border ${cardTone} ${
    mode === "compact" ? "p-4 sm:p-5" : "p-5 sm:p-6"
  } ${className}`;

  return (
    <div data-testid="fitment-wizard" data-mode={mode} className={cardClass}>
      {mode === "compact" ? (
        <div className="grid gap-3 sm:grid-cols-2">{visibleSteps.map(renderStep)}</div>
      ) : (
        <ol className="flex flex-col gap-4 sm:gap-5">{visibleSteps.map(renderStep)}</ol>
      )}
    </div>
  );
}

// A step says at most one thing under its control: it's loading, it failed, or
// it's ready and has nothing to offer. "Disabled because the step before it
// isn't answered" says nothing — the disabled control already shows that.
function renderNote({
  locale,
  step,
  flags,
  noteId,
  onRetry,
  tone,
}: {
  locale: Locale;
  step: StepView;
  flags: { loading: boolean; failed: boolean };
  noteId: string;
  onRetry: () => void;
  tone: FitmentWizardTone;
}): ReactNode {
  const mutedClass = tone === "dark" ? "text-white/60" : "text-neutral-500";
  // red-600 is a dark red; on the banner it sits at roughly the ground's own
  // lightness and the message disappears. red-300 is the same warning, legible.
  const alertClass = tone === "dark" ? "text-red-300" : "text-red-600";

  if (flags.failed) {
    return (
      <p id={noteId} role="alert" className={`text-[12.5px] ${alertClass}`}>
        {pickLocale(locale, "Couldn't load these options.", "بارگذاری گزینه‌ها ممکن نشد.")}{" "}
        <button
          type="button"
          onClick={onRetry}
          className={`rounded font-medium underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none ${
            tone === "dark" ? "focus-visible:ring-accent-on-dark" : "focus-visible:ring-accent"
          }`}
        >
          {pickLocale(locale, "Try again", "تلاش دوباره")}
        </button>
      </p>
    );
  }

  if (flags.loading) {
    return (
      <p id={noteId} role="status" className={`text-[12.5px] ${mutedClass}`}>
        {pickLocale(locale, "Loading…", "در حال بارگذاری…")}
      </p>
    );
  }

  if (!step.disabled && step.options.length === 0) {
    return (
      <p id={noteId} className={`text-[12.5px] ${mutedClass}`}>
        {step.emptyMessage}
      </p>
    );
  }

  return null;
}
