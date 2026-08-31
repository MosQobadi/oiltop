// Splitting an oil-city car name into the model a customer picks and the type
// they pick under it.
//
// **Why this exists.** oil-city has no years, no trims and no types — a whole
// car identity is one string, "i20 مدل 2016-2017 و کرمان موتور". The importer
// had nowhere to put that but `CarModel`, so 806 of them landed as 806 models
// with one synthesised engine each, and the finder's model step listed year
// spans and gearboxes instead of cars. This is the function that takes those
// names apart.
//
// **The rule, decided with the shop owner:** the model is the nameplate and its
// number — تیگو 8, مزدا 3, آریزو 5, تندر 90 — and every trim, body style,
// gearbox and engine word after it becomes a type. Gearbox counts, because an
// automatic and a manual of the same car take different gearbox oil, so
// "ساندرو اتوماتیک" and "ساندرو دنده ای" have to stay two things a customer
// can tell apart.
//
// **Nothing is ever merged away.** Two rows that fold into one model become two
// types under it. `scripts/regroup-cars.ts` asserts the type count is unchanged
// before it commits.

import { toLatinDigits } from "@/lib/import";

/** Persian text as written, with the variations that are not differences removed. */
export function normaliseName(text: string): string {
  return toLatinDigits(text)
    .replace(/‌/g, " ") // ZWNJ reads as a word break here
    .replace(/ي/g, "ی") // Arabic yeh -> Persian yeh
    .replace(/ك/g, "ک") // Arabic kaf -> Persian kaf
    .replace(/[‐-―]/g, "-") // en/em dashes -> hyphen
    .replace(/\s+/g, " ")
    .trim();
}

/** The key two names are grouped on. Case-folded, so "x3" and "X3" are one model. */
export function groupKey(text: string): string {
  return normaliseName(text).toLowerCase();
}

// A word that starts the descriptor: from here on the name is describing a
// version of the car rather than saying which car it is.
const DESCRIPTOR_WORDS = new Set([
  // year and spec framing
  "مدل", "سال", "تیپ", "موتور", "اتاق", "مونتاژ", "تا", "با", "وارداتی",
  // gearbox — the reason a type exists even when the engine is identical
  "اتوماتیک", "دنده", "گیربکس", "سرعته", "دستی",
  // fuel and induction
  "بنزینی", "دیزلی", "دیزل", "هیبرید", "هیبریدی", "توربو",
  "کاربراتور", "کاربراتوری", "انژکتور", "انژکتوری",
  // cylinder count
  "سیلندر", "چهارسیلندر", "شش", "چهار", "هشت",
  // generation
  "قدیم", "جدید", "فیس", "نیو",
  // body style — one model line in two shapes, both still selectable
  "سدان", "هاچ", "هاچبک", "کروک", "کوپه", "صندقدار", "صندوقدار", "استیشن",
  // trim
  //
  // "مکس" and "کراس" are deliberately absent. Both are part of the nameplate
  // more often than they are a trim — Isuzu D-Max, SYM Joymax, Dongfeng Shine
  // Max, Toyota Corolla Cross, Mitsubishi Eclipse Cross — and splitting on them
  // would leave models called "دی" and "کرولا". The two cars where they really
  // are a trim are folded by name below. "تیگو 8 پرو مکس" still splits
  // correctly, because "پرو" comes first.
  "پلاس", "پرو", "کلاسیک", "اسپرت", "لاکچری", "پرستیژ", "تورینگ",
  "استپ", "یورو4", "یورو",
]);

// Trim and engine codes. Matched whole-word and case-insensitively.
//
// "Max" is absent for the same reason "مکس" is: Isuzu sells the D-Max, and
// splitting on it would leave a model called "دی مکس D".
const CODE_WORD =
  /^(?:GLX|SLX|ELX|GX|VX|VXR|GXR|TXL|LX|EX|SE|LE|XLE|GDI|MPI|CRDI|TSI|TFSI|FSI|EF7|EFP|TU3|TU5|XU7|XU7P|XUM|MC|CVT|AL4|4MT|5MT|6MT|AT|MT|V8|V6|S|GT|ADV|Touring|Plus|Pro)$/i;

// A four-digit run, or two joined by a dash — a year or a year span.
const YEAR_WORD = /^\(?\d{4}(?:\s*-\s*\d{4})?\)?$/;
// Three or four digits, optionally with "cc" — a displacement. "اسکالا 1600".
const DISPLACEMENT_WORD = /^\(?\d{3,4}\s*(?:cc)?\)?$/i;

// A bare one or two digit number is part of the NAME (تیگو 8, آریزو 5, تندر 90),
// with one exception: when it is counting something. "لندکروز 6 سیلندر" is a
// Land Cruiser, not a "لندکروز 6". Only these two words trigger it — using the
// whole descriptor set here would cost "تندر 90 اتوماتیک" its 90.
const COUNTED_WORDS = new Set(["سیلندر", "سرعته"]);

function isDescriptorWord(word: string, next: string | undefined): boolean {
  const bare = word.replace(/^[("]|[)"]$/g, "");
  if (YEAR_WORD.test(bare)) return true;
  if (DISPLACEMENT_WORD.test(bare)) return true;
  if (CODE_WORD.test(bare)) return true;
  if (DESCRIPTOR_WORDS.has(bare)) return true;
  if (/^\d{1,2}$/.test(bare) && next !== undefined && COUNTED_WORDS.has(next)) return true;
  return false;
}

// Names for the same car under different wording, confirmed by the shop owner.
// Keyed by brand name, then by the base name the word rules produce.
const MODEL_ALIASES: Record<string, Record<string, string>> = {
  "ایرانخودرو": { "سمند سورن": "سورن", "رانا و رانا": "رانا" },
  "تویوتا": { "لندکروزر": "لندکروز" },
  "رنو": { "تندر": "تندر 90", "ال 90": "تندر 90", "ال90": "تندر 90", "l90": "تندر 90" },
  "پژو": { "پژو پارس": "پارس" },
};

// Names the word rules cannot fold, because what distinguishes them is a
// one-off: a chassis code, an assembler, an edition name. Adding "G" or "W" to
// DESCRIPTOR_WORDS would wreck other brands, so these are listed instead. The
// leftover word becomes the head of the type label — nothing is lost.
//
// سورن and لندکروز پیکاپ were on this list and were taken off: the shop owner
// says they are their own cars, not versions of سمند and لندکروز.
const MODEL_FOLDS: Record<string, Record<string, string>> = {
  "بی ام و": { "325i E46": "325i", "X3 2.5si": "X3", "X3 xDrive28i": "X3" },
  "هیوندای": { "آزرا گرنجور": "آزرا" },
  "نیسان": { "جوک اسکای پک و پلاتینیوم": "جوک", "کیکس Kicks": "کیکس", "وانت زامیاد": "وانت" },
  "کیا": { "اپتیما MG": "اپتیما", "سراتو سایپا": "سراتو" },
  "سانگ یانگ": {
    "کوراندو نورا": "کوراندو",
    "تیوولی فایتر و اسپشیال": "تیوولی",
    "رکستون G4": "رکستون",
    "رکستون W": "رکستون",
    "موسو خان": "موسو",
  },
  "ام وی ام": { "X33 کراس": "X33" },
  "سایپا": { "شاهین G": "شاهین" },
  "وسپا": { "Primavera Yacht Club": "Primavera", "Sprint Super Notte": "Sprint" },
  "ایرانخودرو": { "دنا جوانان": "دنا" },
  "گروه بهمن": { "دیگنیتی پرایم": "دیگنیتی", "فیدلیتی پرایم": "فیدلیتی" },
  "کیو جی موتور": { "SRV 250S": "SRV" },
};

/**
 * The label for a row that named no version at all, in a model that has other
 * rows which did. "Base" — deliberately not a gearbox or a trim, because the
 * source did not say. A person renames these; inferring "manual" from "the
 * other one is automatic" is the guess that puts the wrong oil on the page.
 */
export const UNNAMED_TYPE_LABEL = "پایه";

export interface SplitName {
  /** The model a customer picks: nameplate and its number. */
  base: string;
  /**
   * The type label, or null when the row named no version. Null is resolved by
   * `resolveTypeLabel` once the model's other rows are known.
   */
  type: string | null;
}

/**
 * Splits one source car name into the model and the type beneath it.
 *
 * `brand` is needed for two reasons: the source repeats it inside the model
 * name often enough to matter ("هیوندای سانتافه 2019-2022", "فونیکس تیگو 8 پرو"),
 * and the alias and fold tables are per brand.
 */
export function splitCarName(brand: string, name: string): SplitName {
  const brandName = normaliseName(brand);
  let rest = normaliseName(name);
  if (rest.startsWith(brandName + " ")) rest = rest.slice(brandName.length + 1);

  const words = rest.split(" ");
  let cut = words.length;
  // Starts at 1: the first word is always part of the name, or a model called
  // "2008" or "323 اتوماتیک" would be left with no name at all.
  for (let i = 1; i < words.length; i++) {
    if (isDescriptorWord(words[i], words[i + 1])) {
      cut = i;
      break;
    }
  }

  let base = words.slice(0, cut).join(" ");
  const descriptor = words.slice(cut).join(" ").trim();

  const alias = MODEL_ALIASES[brandName];
  if (alias) {
    const target = alias[base] ?? alias[base.toLowerCase()];
    if (target) base = target;
  }

  // A fold moves the leftover word to the front of the type label.
  let folded = "";
  const folds = MODEL_FOLDS[brandName];
  if (folds) {
    for (const [longer, canonical] of Object.entries(folds)) {
      if (groupKey(base) === groupKey(longer)) {
        folded = base.slice(canonical.length).trim();
        base = canonical;
        break;
      }
    }
  }

  const label = [folded, descriptor].filter((part) => part !== "").join(" ").trim();
  return { base, type: label === "" ? null : label };
}

/**
 * The label a row ends up with, once the model's type count is known.
 *
 * A car with only one version has no version to name, so the row carries the
 * model's own name — the customer picks the model and stops, and the finder
 * never renders a type step for it (see `useFitmentWizard`, which resolves as
 * soon as one type matches). Only a row that sits beside real siblings and
 * named nothing gets `UNNAMED_TYPE_LABEL`.
 */
export function resolveTypeLabel(
  type: string | null,
  modelName: string,
  typeCountInModel: number,
): string {
  if (type !== null) return type;
  return typeCountInModel === 1 ? modelName : UNNAMED_TYPE_LABEL;
}

/**
 * The display spelling for a model whose rows spell it differently — prefer the
 * one that capitalises its Latin letters, so "X3 2.5si" names the model X3 and
 * not x3.
 */
export function preferredSpelling(a: string, b: string): string {
  const caps = (text: string) => (text.match(/[A-Z]/g) ?? []).length;
  return caps(b) > caps(a) ? b : a;
}
