import { describe, expect, it } from "vitest";
import {
  groupKey,
  preferredSpelling,
  resolveTypeLabel,
  splitCarName,
  UNNAMED_TYPE_LABEL,
} from "./regroup";

describe("splitCarName", () => {
  it("keeps the nameplate and moves the year span to the type", () => {
    expect(splitCarName("هیوندای", "i20 2009-2015")).toEqual({
      base: "i20",
      type: "2009-2015",
    });
  });

  it("drops a brand name the source repeated inside the model name", () => {
    expect(splitCarName("هیوندای", "هیوندای سانتافه 2019-2022")).toEqual({
      base: "سانتافه",
      type: "2019-2022",
    });
    expect(splitCarName("فونیکس", "فونیکس تیگو 8 پرو مکس")).toEqual({
      base: "تیگو 8",
      type: "پرو مکس",
    });
  });

  // The rule the shop owner set: the number is part of the name, so Tiggo 7 and
  // Tiggo 8 are two cars, and pro / pro max are two types of one of them.
  it("treats a model's number as its name, not a trim", () => {
    expect(splitCarName("چری", "آریزو 5 اتوماتیک").base).toBe("آریزو 5");
    expect(splitCarName("چری", "آریزو 6 پرو").base).toBe("آریزو 6");
    expect(splitCarName("چری", "تیگو 7 پرو CVT")).toEqual({
      base: "تیگو 7",
      type: "پرو CVT",
    });
  });

  // Regression: a bare number followed by any descriptor used to end the name,
  // which cost "تندر 90 اتوماتیک" its 90 and merged Arrizo 5 into Arrizo 6.
  it("only ends the name on a bare number when that number is counting something", () => {
    expect(splitCarName("رنو", "تندر 90 اتوماتیک")).toEqual({
      base: "تندر 90",
      type: "اتوماتیک",
    });
    expect(splitCarName("تویوتا", "لندکروز 6 سیلندر 4500cc دنده ای مدل 1998-2003")).toEqual({
      base: "لندکروز",
      type: "6 سیلندر 4500cc دنده ای مدل 1998-2003",
    });
  });

  // Gearbox is a type even when the engine is identical: an automatic and a
  // manual of the same car take different gearbox oil.
  it("splits on gearbox wording", () => {
    expect(splitCarName("رنو", "ساندرو دنده ای")).toEqual({ base: "ساندرو", type: "دنده ای" });
    expect(splitCarName("رنو", "ساندرو اتوماتیک")).toEqual({ base: "ساندرو", type: "اتوماتیک" });
  });

  it("splits on a body style, keeping one model line in two shapes", () => {
    expect(splitCarName("پژو", "206 صندقدار اتوماتیک")).toEqual({
      base: "206",
      type: "صندقدار اتوماتیک",
    });
  });

  it("keeps a first word that looks like a year or a displacement", () => {
    // Peugeot 2008 and Mazda 2000 are model names, not years.
    expect(splitCarName("پژو", "2008")).toEqual({ base: "2008", type: null });
    expect(splitCarName("مزدا", "2000")).toEqual({ base: "2000", type: null });
    expect(splitCarName("مزدا", "323 اتوماتیک")).toEqual({ base: "323", type: "اتوماتیک" });
  });

  it("reads a displacement after the name as a type", () => {
    expect(splitCarName("رنو", "اسکالا 1600")).toEqual({ base: "اسکالا", type: "1600" });
  });

  it("returns a null type when the row names no version at all", () => {
    expect(splitCarName("چری", "تیگو 7")).toEqual({ base: "تیگو 7", type: null });
  });

  it("folds names the shop owner confirmed are the same car", () => {
    expect(splitCarName("پژو", "پژو پارس").base).toBe("پارس");
    expect(splitCarName("رنو", "تندر").base).toBe("تندر 90");
    expect(splitCarName("رنو", "ال 90").base).toBe("تندر 90");
    // Same car, spelled two ways in the same catalog.
    expect(splitCarName("تویوتا", "لندکروزر VXR هشت سیلندر اتاق 100 مدل 2003-2008").base).toBe(
      "لندکروز",
    );
  });

  it("keeps the cars the shop owner said are NOT the same", () => {
    // سورن is its own car, and is called سورن — not a type of سمند.
    expect(splitCarName("ایرانخودرو", "سمند سورن EF7")).toEqual({ base: "سورن", type: "EF7" });
    expect(splitCarName("ایرانخودرو", "سمند EF7 توربو").base).toBe("سمند");
    expect(splitCarName("تویوتا", "لندکروز پیکاپ 6 سیلندر 4500cc دنده ای اتاق J79 مدل 2000-2007").base).toBe(
      "لندکروز پیکاپ",
    );
    // Corolla Cross is not a Corolla.
    expect(splitCarName("تویوتا", "کرولا کراس هیبرید 2023-2026").base).toBe("کرولا کراس");
  });

  it("moves a one-off fold's leftover word into the type rather than losing it", () => {
    expect(splitCarName("سانگ یانگ", "رکستون W 2013-2014")).toEqual({
      base: "رکستون",
      type: "W 2013-2014",
    });
    expect(splitCarName("سایپا", "شاهین G اتوماتیک")).toEqual({
      base: "شاهین",
      type: "G اتوماتیک",
    });
  });

  it("normalises the variations that are not differences", () => {
    // Persian digits, Arabic yeh, ZWNJ — the seeded ۲۰۶ and the imported 206
    // have to land on one model.
    expect(groupKey(splitCarName("پژو", "۲۰۶").base)).toBe(
      groupKey(splitCarName("پژو", "206 تیپ 2 سال 1381-1385").base),
    );
  });
});

describe("resolveTypeLabel", () => {
  // "Only one version" means there is nothing to choose, so the row carries the
  // model's own name and the finder never renders a type step for it.
  it("names a lone type after its model", () => {
    expect(resolveTypeLabel(null, "تیگو 5", 1)).toBe("تیگو 5");
  });

  it("marks a row that named nothing but has siblings, rather than inventing a trim", () => {
    expect(resolveTypeLabel(null, "تندر 90", 2)).toBe(UNNAMED_TYPE_LABEL);
  });

  it("leaves a stated type alone", () => {
    expect(resolveTypeLabel("پرو مکس", "تیگو 8", 3)).toBe("پرو مکس");
    expect(resolveTypeLabel("اتوماتیک", "تیگو 5", 1)).toBe("اتوماتیک");
  });
});

describe("preferredSpelling", () => {
  it("prefers the spelling that capitalises its Latin letters", () => {
    expect(preferredSpelling("x3", "X3")).toBe("X3");
    expect(preferredSpelling("X3", "x3")).toBe("X3");
  });

  it("leaves Persian names alone", () => {
    expect(preferredSpelling("توسان", "توسان")).toBe("توسان");
  });
});
