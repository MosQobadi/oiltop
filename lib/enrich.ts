// Reading a car's year span out of the name the source gave it.
//
// oil-city has no year field, but it puts years in model names constantly —
// "A6 2011-2015", "هایلوکس 2005-2013", "پژو 206 تیپ 2 سال 1386-1401". Task G.2
// measured it: 302 of 802 imported models name a year and 259 name a full span.
// That is a third of the catalog's years available for nothing, before
// hamrah-mechanic is scraped for the rest.
//
// **Only a RANGE is trusted, never a single year.** The source's names are full
// of numbers that look like years and are not: "اسکالا 2000" and "اسکالا 1600"
// are engine displacements, "راوفور RAV4 2500cc" likewise. A lone 2000 sits
// squarely inside the Gregorian window and would silently date a 2000cc Renault
// to the year 2000. Two numbers joined by a dash are a span and are not
// something a displacement looks like.
//
// The calendar comes from the numbers themselves — see lib/year.ts. Both ends
// must agree, which rules out "از 1404 تا 2024" style nonsense before it can be
// stored.

import { calendarForYear, type YearCalendar } from "./year";

export interface ParsedYearSpan {
  yearStart: number;
  yearEnd: number;
  yearCalendar: YearCalendar;
}

// Two 3-or-4 digit runs joined by a dash — ASCII hyphen, en dash, or the Persian
// forms that turn up in copy-pasted names. Digits are normalised to ASCII by the
// caller before this runs.
const SPAN_PATTERN = /(\d{4})\s*[-–—]\s*(\d{4})/;

/**
 * The year span a model name states, or null when it states none this can trust.
 *
 * Null is the common answer and an entirely fine one: it means the name did not
 * say, and the row keeps the placeholder span the import gave it.
 */
export function parseYearSpanFromName(
  name: string,
  toLatinDigits: (s: string) => string,
): ParsedYearSpan | null {
  const match = SPAN_PATTERN.exec(toLatinDigits(name));
  if (match === null) return null;

  const yearStart = Number(match[1]);
  const yearEnd = Number(match[2]);

  const startCalendar = calendarForYear(yearStart);
  const endCalendar = calendarForYear(yearEnd);

  // Both ends have to be years, and years in the same calendar. A span whose
  // ends disagree is not a span — it is two different facts printed together,
  // and picking one would be inventing the other.
  if (startCalendar === null || startCalendar !== endCalendar) return null;

  // A backwards span is a typo or a misparse, not a range to store.
  if (yearEnd < yearStart) return null;

  return { yearStart, yearEnd, yearCalendar: startCalendar };
}
