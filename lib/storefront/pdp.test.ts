import { describe, expect, it } from "vitest";
import {
  buildSizeOptions,
  formatGroupEngineLabels,
  formatProductSpecs,
  formatVolume,
  groupContainsEngine,
  groupFittingEnginesByModel,
  type FittingEngineParts,
  type ProductSizeParts,
} from "./pdp";
import { firstFilled } from "./seo";

const peugeot = { nameEn: "Peugeot", nameFa: "پژو" };

function engine(
  overrides: Partial<FittingEngineParts> & { carEngineId: string },
): FittingEngineParts {
  return {
    labelEn: "1.4L TU3 Petrol",
    labelFa: "۱٫۴ لیتر TU3 بنزینی",
    yearStart: 2001,
    yearEnd: 2010,
    carModel: { id: "mdl_206", nameEn: "206", nameFa: "۲۰۶" },
    carBrand: peugeot,
    ...overrides,
  };
}

describe("groupFittingEnginesByModel", () => {
  it("collapses several engines of one model into a single group", () => {
    const groups = groupFittingEnginesByModel([
      engine({ carEngineId: "eng_1" }),
      engine({ carEngineId: "eng_2", labelEn: "1.6L", yearStart: 2003, yearEnd: 2012 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].carModel.nameEn).toBe("206");
    expect(groups[0].engines.map((row) => row.carEngineId)).toEqual(["eng_1", "eng_2"]);
  });

  it("spans the group across the earliest and latest year of its engines", () => {
    const groups = groupFittingEnginesByModel([
      engine({ carEngineId: "eng_1", yearStart: 2003, yearEnd: 2012 }),
      engine({ carEngineId: "eng_2", yearStart: 2001, yearEnd: 2010 }),
    ]);

    expect(groups[0]).toMatchObject({ yearStart: 2001, yearEnd: 2012 });
  });

  it("leaves the span open-ended when any one engine is still in production", () => {
    const groups = groupFittingEnginesByModel([
      engine({ carEngineId: "eng_1", yearStart: 2001, yearEnd: 2010 }),
      engine({ carEngineId: "eng_2", yearStart: 2011, yearEnd: null }),
    ]);

    expect(groups[0]).toMatchObject({ yearStart: 2001, yearEnd: null });
  });

  it("keeps separate models apart, in the order the service resolved them", () => {
    const groups = groupFittingEnginesByModel([
      engine({ carEngineId: "eng_1", carModel: { id: "mdl_405", nameEn: "405", nameFa: "۴۰۵" } }),
      engine({ carEngineId: "eng_2" }),
      engine({ carEngineId: "eng_3", carModel: { id: "mdl_405", nameEn: "405", nameFa: "۴۰۵" } }),
    ]);

    expect(groups.map((group) => group.carModel.nameEn)).toEqual(["405", "206"]);
    expect(groups[0].engines).toHaveLength(2);
  });

  it("returns nothing for a product no fitment profile references", () => {
    expect(groupFittingEnginesByModel([])).toEqual([]);
  });
});

describe("formatGroupEngineLabels", () => {
  it("drops the years when the model has one engine — the heading already spans them", () => {
    const [group] = groupFittingEnginesByModel([engine({ carEngineId: "eng_1" })]);

    expect(formatGroupEngineLabels("en", group)).toEqual(["1.4L TU3 Petrol"]);
  });

  it("keeps each range when several engines share a model", () => {
    const [group] = groupFittingEnginesByModel([
      engine({ carEngineId: "eng_1" }),
      engine({ carEngineId: "eng_2", labelEn: "1.6L", yearStart: 2011, yearEnd: null }),
    ]);

    expect(formatGroupEngineLabels("en", group)).toEqual([
      "1.4L TU3 Petrol (2001–2010)",
      "1.6L (2011–Present)",
    ]);
  });

  it("reads the Persian label on the Persian tree", () => {
    const [group] = groupFittingEnginesByModel([engine({ carEngineId: "eng_1" })]);

    expect(formatGroupEngineLabels("fa", group)).toEqual(["۱٫۴ لیتر TU3 بنزینی"]);
  });
});

describe("groupContainsEngine", () => {
  const [group] = groupFittingEnginesByModel([
    engine({ carEngineId: "eng_1" }),
    engine({ carEngineId: "eng_2" }),
  ]);

  it("finds the engine a customer arrived with", () => {
    expect(groupContainsEngine(group, "eng_2")).toBe(true);
  });

  it("is false for an engine this product was never matched to", () => {
    expect(groupContainsEngine(group, "eng_9")).toBe(false);
  });
});

describe("formatVolume", () => {
  it("reads whole litres as litres", () => {
    expect(formatVolume("en", 4000)).toBe("4 L");
  });

  it("keeps anything that doesn't divide evenly in millilitres", () => {
    expect(formatVolume("en", 500)).toBe("500 ml");
    expect(formatVolume("en", 3785)).toBe("3,785 ml");
  });

  it("translates the unit and the digits", () => {
    expect(formatVolume("fa", 4000)).toBe("۴ لیتر");
  });
});

describe("formatProductSpecs", () => {
  const noSpecs = { viscosity: null, apiGrade: null, volumeMl: null };

  it("is empty when the product carries no specs — the PDP renders no section", () => {
    expect(formatProductSpecs("en", noSpecs)).toEqual([]);
  });

  it("lists only the specs that are set, viscosity first", () => {
    expect(formatProductSpecs("en", { ...noSpecs, volumeMl: 1000, viscosity: "5W-30" })).toEqual([
      { label: "Viscosity", value: "5W-30" },
      { label: "Volume", value: "1 L" },
    ]);
  });

  it("skips a blank string, which an import can still produce", () => {
    expect(formatProductSpecs("en", { ...noSpecs, viscosity: "   ", apiGrade: "SN" })).toEqual([
      { label: "API grade", value: "SN" },
    ]);
  });
});

describe("buildSizeOptions", () => {
  function size(overrides: Partial<ProductSizeParts> & { slug: string }): ProductSizeParts {
    return {
      nameEn: "Mobil Super 5W-30",
      nameFa: "موبیل سوپر ۵W-۳۰",
      volumeMl: 4000,
      ...overrides,
    };
  }

  const current = size({ slug: "mobil-super-5w30-4l" });

  it("is empty for a product with no siblings — the PDP renders no selector", () => {
    expect(buildSizeOptions("en", current, [])).toEqual([]);
  });

  it("lists the current size among its siblings, smallest first", () => {
    const options = buildSizeOptions("en", current, [
      size({ slug: "mobil-super-5w30-5l", volumeMl: 5000 }),
      size({ slug: "mobil-super-5w30-1l", volumeMl: 1000 }),
    ]);

    expect(options).toEqual([
      { slug: "mobil-super-5w30-1l", label: "1 L", isCurrent: false },
      { slug: "mobil-super-5w30-4l", label: "4 L", isCurrent: true },
      { slug: "mobil-super-5w30-5l", label: "5 L", isCurrent: false },
    ]);
  });

  it("falls back to the name and sorts last when a sibling has no volume", () => {
    const options = buildSizeOptions("en", current, [
      size({ slug: "mobil-super-5w30-drum", volumeMl: null, nameEn: "Mobil Super 5W-30 Drum" }),
      size({ slug: "mobil-super-5w30-1l", volumeMl: 1000 }),
    ]);

    expect(options.map((option) => option.label)).toEqual(["1 L", "4 L", "Mobil Super 5W-30 Drum"]);
  });

  it("labels the sizes in Persian on the Persian tree", () => {
    const options = buildSizeOptions("fa", current, [
      size({ slug: "mobil-super-5w30-drum", volumeMl: null, nameFa: "بشکه موبیل سوپر" }),
    ]);

    expect(options.map((option) => option.label)).toEqual(["۴ لیتر", "بشکه موبیل سوپر"]);
  });
});

describe("firstFilled", () => {
  it("takes the first value with something in it", () => {
    expect(firstFilled(null, "Meta title", "Name")).toBe("Meta title");
  });

  it("skips a field the admin left untouched, which arrives as an empty string", () => {
    expect(firstFilled("", "   ", "Name")).toBe("Name");
  });

  it("returns undefined rather than an empty tag when nothing is filled", () => {
    expect(firstFilled("", null, undefined)).toBeUndefined();
  });
});
