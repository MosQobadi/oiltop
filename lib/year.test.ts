import { describe, expect, it } from "vitest";
import {
  ANY_CALENDAR_YEAR_MAX,
  ANY_CALENDAR_YEAR_MIN,
  currentJalaliYear,
  isYearInCalendar,
  yearBoundsFor,
  yearRangeMessage,
} from "./year";

describe("currentJalaliYear", () => {
  it("reads a plausible Jalali year from Intl", () => {
    const year = currentJalaliYear();
    // Deliberately loose: this asserts the Persian calendar is wired up and
    // returning a Jalali year rather than a Gregorian one, without pinning the
    // test to a date it would fail on next Nowruz.
    expect(year).toBeGreaterThan(1400);
    expect(year).toBeLessThan(1500);
  });
});

describe("yearBoundsFor", () => {
  it("bounds Gregorian years to the modern-car window", () => {
    expect(yearBoundsFor("GREGORIAN")).toEqual({ min: 1900, max: 2100 });
  });

  it("bounds Jalali years by the current year, so next year's models are enterable", () => {
    const { min, max } = yearBoundsFor("JALALI");
    expect(min).toBe(1370);
    expect(max).toBe(currentJalaliYear() + 1);
  });

  it("keeps the two windows disjoint, which is what lets a year identify its calendar", () => {
    const jalali = yearBoundsFor("JALALI");
    const gregorian = yearBoundsFor("GREGORIAN");
    expect(jalali.max).toBeLessThan(gregorian.min);
  });
});

describe("isYearInCalendar", () => {
  it("accepts a Jalali model year in a Jalali calendar", () => {
    expect(isYearInCalendar(1390, "JALALI")).toBe(true);
  });

  it("rejects a Jalali model year in a Gregorian calendar", () => {
    // The bug this whole feature exists to prevent: 1390 looks like a valid
    // year and would land as a car built in the 14th century.
    expect(isYearInCalendar(1390, "GREGORIAN")).toBe(false);
  });

  it("rejects a Gregorian year in a Jalali calendar", () => {
    expect(isYearInCalendar(2018, "JALALI")).toBe(false);
  });

  it("accepts a Gregorian year in a Gregorian calendar", () => {
    expect(isYearInCalendar(2018, "GREGORIAN")).toBe(true);
  });

  it("rejects a Jalali year past next year", () => {
    expect(isYearInCalendar(currentJalaliYear() + 2, "JALALI")).toBe(false);
  });

  it("rejects non-integers", () => {
    expect(isYearInCalendar(1390.5, "JALALI")).toBe(false);
    expect(isYearInCalendar(Number.NaN, "GREGORIAN")).toBe(false);
  });
});

describe("yearRangeMessage", () => {
  it("names the calendar it is talking about", () => {
    expect(yearRangeMessage("JALALI")).toContain("Jalali");
    expect(yearRangeMessage("GREGORIAN")).toContain("Gregorian");
    expect(yearRangeMessage("GREGORIAN")).toContain("1900");
  });
});

describe("the cross-calendar window", () => {
  it("covers every year either calendar can hold", () => {
    expect(ANY_CALENDAR_YEAR_MIN).toBeLessThanOrEqual(yearBoundsFor("JALALI").min);
    expect(ANY_CALENDAR_YEAR_MAX).toBeGreaterThanOrEqual(yearBoundsFor("GREGORIAN").max);
  });
});
