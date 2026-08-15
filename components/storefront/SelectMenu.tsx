"use client";

import { Label, ListBox, Select } from "@heroui/react";
import { localeDir, type Locale } from "@/lib/i18n";

// Every storefront dropdown — the PLP's category/brand filters, the sort
// control, the fitment wizard's four steps — renders through here.
//
// A native <select> styles its box but not its list: the open menu is drawn by
// the operating system, so it ignores the site's radius, spacing, font and
// accent entirely, and looks like a different application on every platform.
// HeroUI's Select is a listbox in the page, which is what lets the *open* state
// match the rest of the storefront. The trigger deliberately keeps the same
// classes as the search input beside it, so a closed dropdown and a text box
// still read as one row of controls.

export interface SelectMenuOption {
  value: string;
  label: string;
}

export interface SelectMenuProps {
  /**
   * Only the menu needs this. The trigger sits in the page and inherits `dir`
   * from `<html>`; the menu is portaled to the end of `<body>`, where
   * react-aria stamps its own `dir` from *its* locale — which is the browser's,
   * not the route's, because the storefront has no react-aria locale provider.
   * On `/fa` that left-aligns Persian menu items under a right-aligned trigger.
   */
  locale: Locale;
  label: string;
  /**
   * Rendered in the order given. A caller that wants an "All"/reset entry puts
   * it in the list itself — see `EMPTY_KEY` on why `""` is a legal value here.
   */
  options: SelectMenuOption[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  /** The id of a note describing the control — the wizard's per-step message. */
  describedBy?: string;
  /** `inline` puts the label beside the trigger; the default stacks them. */
  orientation?: "stacked" | "inline";
  /**
   * Lands on the trigger, for the e2e suite. A listbox trigger's accessible
   * name is its *value* followed by its label ("All Brand"), so it moves as the
   * customer uses it — `getByLabel` can't address one the way it could a native
   * <select>.
   */
  testId?: string;
  className?: string;
}

// An empty string is a real, selectable choice in these menus: "All" clears a
// filter and the wizard's first entry resets a step. react-aria addresses items
// by key and reads a null key as "nothing is selected", which an empty-string
// key is indistinguishable from — so `""` travels as this sentinel and is
// mapped back at both boundaries.
const EMPTY_KEY = "__empty__";

const toKey = (value: string) => (value === "" ? EMPTY_KEY : value);
const fromKey = (key: string) => (key === EMPTY_KEY ? "" : key);

const TRIGGER_CLASS =
  "focus-visible:border-accent focus-visible:ring-accent flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-neutral-300 bg-white px-3 py-2 text-start text-sm text-neutral-900 transition-colors hover:border-neutral-400 focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400 disabled:hover:border-neutral-200";

const LABEL_CLASS = "text-[12.5px] font-medium text-neutral-600";

export function SelectMenu({
  locale,
  label,
  options,
  value,
  onChange,
  isDisabled,
  describedBy,
  orientation = "stacked",
  testId,
  className = "",
}: SelectMenuProps) {
  const isInline = orientation === "inline";

  return (
    <Select
      selectedKey={toKey(value)}
      onSelectionChange={(key) => onChange(key == null ? "" : fromKey(String(key)))}
      isDisabled={isDisabled}
      aria-describedby={describedBy}
      fullWidth={!isInline}
      className={`flex ${isInline ? "flex-row items-center gap-2" : "flex-col gap-1.5"} ${className}`}
    >
      <Label className={`${LABEL_CLASS} ${isInline ? "shrink-0" : ""}`}>{label}</Label>
      <Select.Trigger data-testid={testId} className={TRIGGER_CLASS}>
        <Select.Value className="min-w-0 truncate" />
        <Select.Indicator className="size-4 shrink-0 text-neutral-400" />
      </Select.Trigger>
      {/* `direction` in CSS rather than a `dir` prop: react-aria stamps its own
          `dir` on the popover after props are spread, so the attribute is not
          ours to set — but an author-level `direction` still outranks the one
          that attribute implies. */}
      <Select.Popover
        className={`rounded-[12px] border border-neutral-200 bg-white p-1 shadow-lg ${
          localeDir(locale) === "rtl" ? "[direction:rtl]" : "[direction:ltr]"
        }`}
      >
        {/* The menu is portaled out of the Select, so it doesn't inherit the
            trigger's label — without this it announces as an unnamed listbox
            (which HeroUI warns about at runtime). */}
        <ListBox aria-label={label} items={options} className="max-h-64 overflow-auto outline-none">
          {(option: SelectMenuOption) => (
            <ListBox.Item
              id={toKey(option.value)}
              textValue={option.label}
              className="data-[focused]:bg-accent/8 data-[selected]:text-accent cursor-pointer rounded-[8px] px-3 py-2 text-sm text-neutral-700 outline-none data-[selected]:font-medium"
            >
              {option.label}
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
