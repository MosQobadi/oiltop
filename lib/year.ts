// Two calendars live side by side in this catalog. An Iranian-built car is sold
// by its Jalali model year — a Pride is "model 1390" and a customer picking a
// year in the car finder looks for 1390, not 2011 — while an imported car is
// sold by its Gregorian year. Which one applies is recorded per `CarModel`,
// not per brand: a single brand carries both, because Saipa sells Pride 131 as
// 1390–1399 and CS35 Plus as 2024.
//
// **Years are stored exactly as written, never converted to one canonical
// calendar.** A model year is a label, not a date: Jalali 1390 runs from March
// 2011 to March 2012, so "1390 = 2011" invents precision no source ever had,
// and an admin who typed 1390 would reopen the form to find 2011. Skipping the
// conversion is safe because every year comparison in this app is scoped to a
// single model — the finder is brand → model → year → type — so a Jalali year
// is never compared against a Gregorian one.

export type YearCalendar = "JALALI" | "GREGORIAN";

const GREGORIAN_MIN = 1900;
const GREGORIAN_MAX = 2100;
// Nobody is entering a car from the 1360s, and the lower bound is what stops a
// mistyped Gregorian year from passing as a plausible Jalali one.
const JALALI_MIN = 1370;

/**
 * The current Jalali year, from ICU rather than a conversion library — Node
 * ships the Persian calendar, and date-fns does not do Jalali.
 */
export function currentJalaliYear(): number {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian", { year: "numeric" }).formatToParts(
    new Date(),
  );
  const year = parts.find((part) => part.type === "year")?.value;
  const parsed = Number(year);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Could not read the current Jalali year from Intl (got ${String(year)})`);
  }
  return parsed;
}

/**
 * The range a year may be entered in, for the given calendar. The Jalali upper
 * bound is computed rather than hardcoded so it does not silently expire — next
 * year's models have to be enterable next year without a code change.
 */
export function yearBoundsFor(calendar: YearCalendar): { min: number; max: number } {
  return calendar === "JALALI"
    ? { min: JALALI_MIN, max: currentJalaliYear() + 1 }
    : { min: GREGORIAN_MIN, max: GREGORIAN_MAX };
}

export function isYearInCalendar(year: number, calendar: YearCalendar): boolean {
  const { min, max } = yearBoundsFor(calendar);
  return Number.isInteger(year) && year >= min && year <= max;
}

export function yearRangeMessage(calendar: YearCalendar): string {
  const { min, max } = yearBoundsFor(calendar);
  const name = calendar === "JALALI" ? "Jalali" : "Gregorian";
  return `Enter a valid ${name} year between ${min} and ${max}`;
}

// How a bare year is classified when no calendar is stated — the enrichment
// pass's rule. The two windows MUST NOT overlap; that non-overlap is the whole
// reason a year can identify its own calendar without a per-source rule.
const JALALI_WINDOW = { min: 1300, max: 1450 };
const GREGORIAN_WINDOW = { min: 1900, max: 2100 };

/**
 * Which calendar a bare year belongs to, or null when it belongs to neither.
 *
 * Works because Jalali model years (~1370-1405) and Gregorian ones (~1990-2026)
 * occupy disjoint numeric windows: 1390 can only be Jalali and 2018 can only be
 * Gregorian. A value outside both is returned as null to be reported rather than
 * guessed at.
 */
export function calendarForYear(year: number): YearCalendar | null {
  if (!Number.isInteger(year)) return null;
  if (year >= JALALI_WINDOW.min && year <= JALALI_WINDOW.max) return "JALALI";
  if (year >= GREGORIAN_WINDOW.min && year <= GREGORIAN_WINDOW.max) return "GREGORIAN";
  return null;
}

// The widest window any stored year can fall in. Two things rely on it: the Zod
// schemas, which validate a request before its model's calendar is known, and
// the Fitment Profile engine picker, which is the one year filter that searches
// across models and so cannot scope itself to one calendar.
//
// Taking the union is safe rather than merely permissive, because the two
// calendars' plausible years never overlap: a Jalali model year (1370-1405) can
// never collide with a Gregorian one (1900-2100). That is why a 1390–1399
// filter matches no Gregorian car — which is right, since a Gregorian car has
// no year 1390 — and why the per-calendar range is still enforced afterwards,
// against the model, in server/carEngine.ts.
export const ANY_CALENDAR_YEAR_MIN = JALALI_MIN;
export const ANY_CALENDAR_YEAR_MAX = GREGORIAN_MAX;
