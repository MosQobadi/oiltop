import { describe, expect, it } from "vitest";
import { makerSlugsFrom, modelHrefsFrom, parseModelTitle } from "./models";

describe("parseModelTitle", () => {
  it("reads the name and Jalali span from a real title", () => {
    expect(parseModelTitle("قیمت سمند LX صفر  و کارکرده 1382-1401 امروز – همراه مکانیک")).toEqual({
      nameFa: "سمند LX",
      yearStart: 1382,
      yearEnd: 1401,
    });
  });

  // The bug this exists for: stripping "صفر و کارکرده" with an alternation on
  // "و" also matched the final letter of "پژو", and truncated every Peugeot in
  // the catalog to "پژ". The name is taken as everything BEFORE the span
  // instead, which cannot cut a word in half.
  it("keeps a maker whose name ends in the word it would otherwise strip", () => {
    expect(parseModelTitle("قیمت پژو 405 SLX صفر و کارکرده 1388-1400 امروز")?.nameFa).toBe(
      "پژو 405 SLX",
    );
    expect(parseModelTitle("قیمت پژو پارس صفر و کارکرده 1380-1403 امروز")?.nameFa).toBe("پژو پارس");
  });

  it("handles Persian digits in the span", () => {
    expect(parseModelTitle("قیمت پراید 131 کارکرده ۱۳۸۹-۱۳۹۹")).toEqual({
      nameFa: "پراید 131",
      yearStart: 1389,
      yearEnd: 1399,
    });
  });

  it("returns null when the title states no span", () => {
    expect(parseModelTitle("قیمت خودرو – همراه مکانیک")).toBeNull();
  });

  it("returns null when nothing is left of the name", () => {
    expect(parseModelTitle("قیمت 1382-1401")).toBeNull();
  });
});

describe("makerSlugsFrom", () => {
  it("takes only maker index links", () => {
    const html = `<a href="/carprice/irankhodro/">ایران خودرو</a>
      <a href="/carprice/saipa/">سایپا</a>
      <a href="/carprice/irankhodro/peugeot206/">206</a>
      <a href="/carprice/">همه</a>
      <a href="/mag/something/">مقاله</a>`;
    expect(makerSlugsFrom(html)).toEqual(["irankhodro", "saipa"]);
  });

  it("does not repeat a maker linked twice", () => {
    const html = `<a href="/carprice/saipa/">سایپا</a><a href="/carprice/saipa/">سایپا</a>`;
    expect(makerSlugsFrom(html)).toEqual(["saipa"]);
  });
});

describe("modelHrefsFrom", () => {
  it("takes model pages and not type pages or maker indexes", () => {
    const html = `<a href="/carprice/irankhodro/">ایران خودرو</a>
      <a href="/carprice/irankhodro/peugeot206/">206</a>
      <a href="/carprice/irankhodro/peugeot206/type-161">تیپ</a>
      <a href="/carprice/saipa/pride131/">پراید</a>`;
    expect(modelHrefsFrom(html)).toEqual([
      "/carprice/irankhodro/peugeot206/",
      "/carprice/saipa/pride131/",
    ]);
  });
});
