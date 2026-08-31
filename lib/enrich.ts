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
import { normaliseForMatch } from "./import";

export interface ParsedYearSpan {
  yearStart: number;
  yearEnd: number;
  yearCalendar: YearCalendar;
}

// Two 4-digit runs joined by a dash — ASCII hyphen, en dash, or the Persian
// forms that turn up in copy-pasted names — or by the Persian word "تا"
// ("from X to Y"), which the source writes just as often: "توسان 2011 تا 2015"
// and "سوناتا ۲۰۰۶ تا ۲۰۱۱" sit beside "هایلوکس 2005-2013" in the same catalog.
// Digits are normalised to ASCII by the caller before this runs, so the Persian
// numerals in the second example arrive here as 2006 and 2011.
//
// "تا" is as much a span marker as a dash and carries the same guarantee: it
// joins two numbers, which is what makes a year safe to read where a lone
// number is not. A displacement is never written "1600 تا 2000".
const SPAN_PATTERN = /(\d{4})\s*(?:[-–—]|تا)\s*(\d{4})/;

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

// ---------------------------------------------------------------------------
// Matching a second source's models to ours
// ---------------------------------------------------------------------------

export interface MatchableModel {
  /** As the other source names it, maker included — "پژو 405 SLX". */
  nameFa: string;
  yearStart: number;
  yearEnd: number;
  yearCalendar: YearCalendar;
}

/**
 * The key both sides are compared on.
 *
 * hamrah-mechanic's model titles carry the maker ("پژو 405 SLX") while ours keep
 * it in a separate row, so ours is joined back together before comparing. That
 * is also what avoids mapping between two sets of brand slugs — a mapping that
 * would have been wrong immediately, because hamrah files Peugeots under
 * `irankhodro` while oil-city calls the brand "پژو".
 *
 * `normaliseForMatch` handles the differences that are not differences: ZWNJ,
 * Arabic vs Persian yeh and kaf, Persian digits, doubled spaces.
 */
export function matchKey(...parts: Array<string | null | undefined>): string {
  return normaliseForMatch(parts.filter((part) => part != null && part !== "").join(" "));
}

export type MatchOutcome<T> =
  { kind: "matched"; model: T } | { kind: "none" } | { kind: "ambiguous"; count: number };

/**
 * Finds the span in `candidates` whose name is exactly ours, or says why not.
 *
 * **Exact after normalisation, and nothing looser.** A near-miss like
 * "206 صندقدار اتوماتیک" against "پژو 206 صندوقدار" — a real pair, differing by
 * one letter and one word — is reported rather than matched. The cost of being
 * wrong here is not a cosmetic error: a car whose year span is wrong matches
 * nothing when a customer picks their year, and they are told their car is not
 * supported. A gap is recoverable by hand; a wrong span looks correct and is
 * never looked at again.
 *
 * Ambiguity is judged on the SPAN, not on the number of candidates. The source
 * lists many models under two maker paths — "پژو 405 SLX" appears under
 * `irankhodro` twice, and 102 of 103 duplicated names carry identical spans —
 * so counting rows would call a duplicate an ambiguity and throw away a perfectly
 * certain answer. Two rows that say the same thing are not a disagreement.
 *
 * Where the spans genuinely differ they are reported and nothing is written:
 * "هاوال H6" is 2013-2016 under `greatwall` and 2024-2025 under `haval`, which
 * are two different cars sharing a name, and picking either would be a coin toss.
 */
export function findExactModel<T extends MatchableModel>(
  ourKey: string,
  candidates: readonly T[],
): MatchOutcome<T> {
  const hits = candidates.filter((candidate) => matchKey(candidate.nameFa) === ourKey);
  if (hits.length === 0) return { kind: "none" };

  const spans = new Set(hits.map((hit) => `${hit.yearStart}-${hit.yearEnd}-${hit.yearCalendar}`));
  if (spans.size === 1) return { kind: "matched", model: hits[0] };
  return { kind: "ambiguous", count: spans.size };
}
