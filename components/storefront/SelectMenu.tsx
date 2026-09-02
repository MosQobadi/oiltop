"use client";

import { useState } from "react";
import { Autocomplete, Label, ListBox, SearchField, Select } from "@heroui/react";
import { localeDir, pickLocale, type Locale } from "@/lib/i18n";
import { matchesSearch } from "@/lib/storefront/option-search";

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
//
// `isSearchable` swaps Select for HeroUI's Autocomplete, which is the same
// listbox with a text field above it. Only the parts differ that have to —
// trigger, popover and items keep the classes below, so a searchable menu and a
// plain one are the same control to look at.

export interface SelectMenuOption {
  value: string;
  label: string;
  /**
   * What a search box matches against, when the visible label isn't the whole
   * story. The car finder passes both spellings of a brand so that a customer
   * on `/fa` can type "peugeot" and one on `/en` can type "پژو". Defaults to
   * `label`; never rendered.
   */
  searchText?: string;
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
  /**
   * Puts a search box at the top of the open menu. Worth it past a couple of
   * dozen entries — the car finder's brand step lists 85 — and only there: on a
   * four-entry sort control it is one more thing to tab through.
   */
  isSearchable?: boolean;
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

// One set of classes for every ground the storefront has, including the hero's.
// There used to be a second, hand-written dark variant here; it existed only
// because the banner was dark while the rest of the site was not. Now that the
// tokens themselves flip, the same trigger is correct on a white card, on a
// dark card, and on the finder panel in either theme.
const TRIGGER_CLASS =
  "focus-visible:border-accent focus-visible:ring-accent flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border border-line-strong bg-surface px-3 py-2 text-start text-sm text-fg transition-colors hover:border-fg-faint focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-fg-faint disabled:hover:border-line";

const LABEL_CLASS = "text-[12.5px] font-medium text-fg-muted";

const INDICATOR_CLASS = "size-4 shrink-0 text-fg-faint";

const POPOVER_CLASS = "rounded-[12px] border border-line bg-surface p-1 shadow-lg";

const LIST_CLASS = "max-h-64 overflow-auto outline-none";

const ITEM_CLASS =
  "data-[focused]:bg-accent/8 data-[selected]:text-accent cursor-pointer rounded-[8px] px-3 py-2 text-sm text-fg-muted outline-none data-[selected]:font-medium";

// `direction` in CSS rather than a `dir` prop: react-aria stamps its own `dir`
// on the popover after props are spread, so the attribute is not ours to set —
// but an author-level `direction` still outranks the one that attribute implies.
const popoverDirClass = (locale: Locale) =>
  localeDir(locale) === "rtl" ? "[direction:rtl]" : "[direction:ltr]";

// The menu is portaled out of the trigger, so it doesn't inherit the trigger's
// label — without this it announces as an unnamed listbox (which HeroUI warns
// about at runtime).
function OptionList({
  label,
  options,
  emptyText,
}: {
  label: string;
  options: SelectMenuOption[];
  /**
   * Only the searchable menu passes this: react-aria filters the list itself,
   * so an empty result is a state this component can reach with a full `options`
   * array. A plain menu with nothing in it is already explained by the caller —
   * the wizard prints its own per-step message under the control.
   */
  emptyText?: string;
}) {
  return (
    <ListBox
      aria-label={label}
      items={options}
      className={LIST_CLASS}
      renderEmptyState={
        emptyText
          ? () => <p className="px-3 py-4 text-center text-[13px] text-fg-subtle">{emptyText}</p>
          : undefined
      }
    >
      {(option: SelectMenuOption) => (
        <ListBox.Item id={toKey(option.value)} textValue={option.label} className={ITEM_CLASS}>
          {option.label}
        </ListBox.Item>
      )}
    </ListBox>
  );
}

export function SelectMenu({
  locale,
  label,
  options,
  value,
  onChange,
  isDisabled,
  isSearchable = false,
  describedBy,
  orientation = "stacked",
  testId,
  className = "",
}: SelectMenuProps) {
  const isInline = orientation === "inline";
  const rootClass = `flex ${isInline ? "flex-row items-center gap-2" : "flex-col gap-1.5"} ${className}`;
  const labelClass = `${LABEL_CLASS} ${isInline ? "shrink-0" : ""}`;

  if (isSearchable) {
    return (
      <SearchableSelectMenu
        locale={locale}
        label={label}
        labelClass={labelClass}
        triggerClass={TRIGGER_CLASS}
        indicatorClass={INDICATOR_CLASS}
        rootClass={rootClass}
        options={options}
        value={value}
        onChange={onChange}
        isDisabled={isDisabled}
        describedBy={describedBy}
        isInline={isInline}
        testId={testId}
      />
    );
  }

  return (
    <Select
      selectedKey={toKey(value)}
      onSelectionChange={(key) => onChange(key == null ? "" : fromKey(String(key)))}
      isDisabled={isDisabled}
      aria-describedby={describedBy}
      fullWidth={!isInline}
      className={rootClass}
    >
      <Label className={labelClass}>{label}</Label>
      <Select.Trigger data-testid={testId} className={TRIGGER_CLASS}>
        <Select.Value className="min-w-0 truncate" />
        <Select.Indicator className={INDICATOR_CLASS} />
      </Select.Trigger>
      <Select.Popover className={`${POPOVER_CLASS} ${popoverDirClass(locale)}`}>
        <OptionList label={label} options={options} />
      </Select.Popover>
    </Select>
  );
}

// `Autocomplete.Filter` is what wires the text field to the list: arrow keys
// from the input move through the options, Enter picks one, and the input keeps
// focus throughout. Filtering the array by hand instead would have left the
// customer tabbing out of the search box to reach what they searched for.
//
// react-aria hands the filter an option's `textValue`, which stays the visible
// label — it is also what a screen reader announces, so widening it to hold
// both languages would have it read "Peugeot پژو" aloud. `searchText` is looked
// up from the label instead, and stays invisible.
function SearchableSelectMenu({
  locale,
  label,
  labelClass,
  triggerClass,
  indicatorClass,
  rootClass,
  options,
  value,
  onChange,
  isDisabled,
  describedBy,
  isInline,
  testId,
}: {
  locale: Locale;
  label: string;
  labelClass: string;
  triggerClass: string;
  indicatorClass: string;
  rootClass: string;
  options: SelectMenuOption[];
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  describedBy?: string;
  isInline: boolean;
  testId?: string;
}) {
  // The query is held here for one reason: the popover keeps its field state
  // when it closes, so without clearing it the menu reopens still filtered by
  // whatever was typed last — most of the list gone, and nothing on the closed
  // trigger to say why. Closing on selection needs no help; react-aria does it.
  const [query, setQuery] = useState("");

  const searchTextByLabel = new Map(
    options.map((option) => [option.label, option.searchText ?? option.label]),
  );

  return (
    <Autocomplete
      selectedKey={toKey(value)}
      onSelectionChange={(key) => onChange(key == null ? "" : fromKey(String(key)))}
      onOpenChange={(isOpen) => {
        if (!isOpen) setQuery("");
      }}
      isDisabled={isDisabled}
      aria-describedby={describedBy}
      fullWidth={!isInline}
      className={rootClass}
    >
      <Label className={labelClass}>{label}</Label>
      <Autocomplete.Trigger data-testid={testId} className={triggerClass}>
        <Autocomplete.Value className="min-w-0 truncate" />
        <Autocomplete.Indicator className={indicatorClass} />
      </Autocomplete.Trigger>
      {/* Two dev-console warnings come out of HeroUI's own composition here and
          neither is reachable from this file. `Autocomplete.Indicator` wraps its
          default chevron in a Button that react-aria calls un-pressable; passing
          an icon of ours would skip that branch, at the cost of a glyph that no
          longer matches the three plain menus beside it. And this popover's
          contents are wrapped in a react-aria Dialog that gets no accessible
          name — `Autocomplete.Popover` spreads props onto the Popover, not the
          Dialog, and RAC's `Heading`, the `slot="title"` it wants, isn't among
          what @heroui/react re-exports. What a customer lands on — the search
          box, the listbox and its options — is named. */}
      <Autocomplete.Popover className={`${POPOVER_CLASS} ${popoverDirClass(locale)}`}>
        <Autocomplete.Filter
          inputValue={query}
          onInputChange={setQuery}
          filter={(textValue, inputValue) =>
            matchesSearch(searchTextByLabel.get(textValue) ?? textValue, inputValue)
          }
        >
          <SearchField
            aria-label={pickLocale(locale, `Search ${label}`, `جست‌وجوی ${label}`)}
            className="mb-1 w-full"
          >
            <SearchField.Group className="focus-within:border-accent flex min-h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-2.5 transition-colors">
              <SearchField.SearchIcon className="size-4 shrink-0 text-fg-faint" />
              <SearchField.Input
                autoComplete="off"
                placeholder={pickLocale(locale, "Search…", "جست‌وجو…")}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-fg outline-none placeholder:text-fg-faint"
              />
            </SearchField.Group>
          </SearchField>

          <OptionList
            label={label}
            options={options}
            emptyText={pickLocale(locale, "Nothing matches that.", "چیزی با این عبارت پیدا نشد.")}
          />
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
