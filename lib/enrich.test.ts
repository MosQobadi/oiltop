import { describe, expect, it } from "vitest";
import { parseYearSpanFromName } from "./enrich";
import { toLatinDigits } from "./import";

const parse = (name: string) => parseYearSpanFromName(name, toLatinDigits);

describe("parseYearSpanFromName", () => {
  it("reads a Gregorian span from a foreign model's name", () => {
    expect(parse("A6 2011-2015")).toEqual({
      yearStart: 2011,
      yearEnd: 2015,
      yearCalendar: "GREGORIAN",
    });
    expect(parse("هایلوکس 2005-2013")?.yearCalendar).toBe("GREGORIAN");
  });

  it("reads a Jalali span from an Iranian model's name", () => {
    // The real thing, from the import: Peugeot 206 Type 2, Jalali years.
    expect(parse("206 تیپ 2 سال 1386-1401")).toEqual({
      yearStart: 1386,
      yearEnd: 1401,
      yearCalendar: "JALALI",
    });
  });

  it("handles Persian digits", () => {
    expect(parse("۲۰۶ تیپ ۵ سال ۱۳۸۱-۱۳۸۵")).toEqual({
      yearStart: 1381,
      yearEnd: 1385,
      yearCalendar: "JALALI",
    });
  });

  it("accepts an en dash as well as a hyphen", () => {
    expect(parse("کمری 2015–2018")?.yearStart).toBe(2015);
  });

  // The trap this exists for. The source names engines by displacement, and a
  // lone "2000" sits squarely inside the Gregorian year window — a single-number
  // parse would date a 2000cc Renault Scala to the year 2000.
  it("ignores a single number, however year-shaped", () => {
    expect(parse("اسکالا 2000")).toBeNull();
    expect(parse("اسکالا 1600")).toBeNull();
    expect(parse("کمری بنزینی 2023-2025 موتور 2000")).toEqual({
      yearStart: 2023,
      yearEnd: 2025,
      yearCalendar: "GREGORIAN",
    });
  });

  it("ignores a displacement written as a range-like pair", () => {
    // Neither end is a plausible year, so there is no calendar to agree on.
    expect(parse("موتور 2500-3000 سی سی")).toBeNull();
  });

  it("refuses a span whose ends disagree on calendar", () => {
    // hamrah-mechanic's pages produce exactly this when a used-car section and a
    // zero-km section are read together. Two facts, not one span.
    expect(parse("چیزی 1404-2024")).toBeNull();
  });

  it("refuses a backwards span", () => {
    expect(parse("کرولا 2015-2011")).toBeNull();
  });

  it("returns null when the name states no years at all", () => {
    expect(parse("پراید انژکتور")).toBeNull();
    expect(parse("CHR توربو 1200")).toBeNull();
  });

  it("takes the first span when a name somehow carries two", () => {
    expect(parse("کرولا 2005-2012 و 2013-2017")?.yearEnd).toBe(2012);
  });
});
