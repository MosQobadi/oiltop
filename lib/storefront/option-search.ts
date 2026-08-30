// Client-side matching for a dropdown's search box — the car finder's brand
// step, where 85 brands is more than anyone should scroll.
//
// This is not `lib/search.ts`. That one builds Prisma `where` clauses out of a
// query an admin typed; this one compares two strings already in the browser,
// and the interesting part is Persian.
//
// A customer looking for a Peugeot types any of: "پژو", "peugeot", "Peugeot". A
// customer looking for a Kia types "کیا" — or the same word spelled with the
// Arabic kaf and yeh that a phone keyboard and a lot of imported data produce.
// A raw `includes` matches none of these against each other, so both sides are
// folded first.

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Letters that are one letter to a reader and two code points to a computer.
// Arabic yeh and kaf are the pair that matters — they are what an Arabic
// keyboard layout produces where Persian text wants U+06CC and U+06A9. The alef
// and hamza forms fold the same way, so that "اودی" finds "آئودی".
const LETTER_FOLDING: Record<string, string> = {
  ي: "ی", // ARABIC YEH           -> FARSI YEH
  ى: "ی", // ALEF MAKSURA         -> FARSI YEH
  ك: "ک", // ARABIC KAF           -> KEHEH
  آ: "ا", // ALEF WITH MADDA      -> ALEF
  أ: "ا", // ALEF WITH HAMZA ABOVE-> ALEF
  إ: "ا", // ALEF WITH HAMZA BELOW-> ALEF
  ٱ: "ا", // ALEF WASLA           -> ALEF
  ؤ: "و", // WAW WITH HAMZA       -> WAW
  ئ: "ی", // YEH WITH HAMZA       -> FARSI YEH
  ة: "ه", // TEH MARBUTA          -> HEH
};

// Marks that carry no meaning for matching: Arabic diacritics (U+064B–U+0652),
// the superscript alef, the zero-width non-joiner Persian uses inside compound
// words, its neighbours, and a BOM a paste can leave behind.
const IGNORED_MARKS = /[ً-ْٰ​-‏﻿]/g;

export function normalizeForSearch(value: string): string {
  let out = "";
  for (const char of value.replace(IGNORED_MARKS, "")) {
    const folded = LETTER_FOLDING[char];
    if (folded !== undefined) {
      out += folded;
      continue;
    }
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian !== -1) {
      out += String(persian);
      continue;
    }
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic !== -1) {
      out += String(arabic);
      continue;
    }
    out += char;
  }
  // Latin case folding, and whitespace collapsed so "mobil  1" matches
  // "Mobil 1".
  return out.toLowerCase().replace(/\s+/g, " ");
}

// Every whitespace-separated token has to appear somewhere in the haystack, in
// any order — the same AND-of-substrings rule `lib/search.ts` applies on the
// server, and for the same reason: "peugeot 206" should match "Peugeot 206"
// however the two words are stored, and a one-word query behaves as before.
//
// An empty query matches everything, which is what a search box nobody has
// typed in yet wants.
export function matchesSearch(haystack: string, query: string): boolean {
  const tokens = normalizeForSearch(query).trim().split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const target = normalizeForSearch(haystack);
  return tokens.every((token) => target.includes(token));
}
