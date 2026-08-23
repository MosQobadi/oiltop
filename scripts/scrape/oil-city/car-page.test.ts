import { describe, expect, it } from "vitest";
import {
  capacityFrom,
  carNamesFromHeading,
  isBareNoteLabel,
  parseCarPage,
  sectionNameFrom,
} from "./car-page";

const URL = "https://www.oil-city.ir/car/toyota/chr/";

interface Section {
  heading: string;
  note?: string;
  /** [name, href] per product card. */
  products?: [string, string][];
}

function card(name: string, href: string): string {
  // Two links to the same product, as the real cards have: one on the image
  // with no text, one on the title.
  return `<div class="card single_product">
    <a href="${href}"><img src="/x.jpg"></a>
    <a href="${href}">${name}</a>
  </div>`;
}

function page(sections: Section[], brandBadge = "تویوتا"): string {
  const blocks = sections
    .map((section, index) => {
      const note =
        section.note === undefined ? "" : `<b class="text-danger">نکته :</b> ${section.note}`;
      const products = (section.products ?? []).map(([name, href]) => card(name, href)).join("");
      return `<div class="card">
        <div class="card-header" id="heading${index}">
          <a class="btn btn-link">${section.heading}</a>
        </div>
        <div class="collapse" id="collapse${index}">
          <div class="card-body"><div class="col-12">${note}</div>${products}</div>
        </div>
      </div>`;
    })
    .join("");

  return `<html><body>
    <div class="title_style2"><h1 class="mb-0 h5">
      <a class="badge badge-secondary">${brandBadge}</a> روغن موتور CHR
    </h1></div>
    <div id="collapseContent">an SEO article, not a section</div>
    <div id="collapseOne">a promo panel, not a section</div>
    ${blocks}
  </body></html>`;
}

const OIL_HEADING =
  "روغن موتور خودرو (با فیلتر روغن 3.9 لیتر بدون فیلتر روغن 3.6 لیتر) برای تویوتا > CHR توربو 1200";

describe("carNamesFromHeading", () => {
  it("reads the brand and model the heading restates", () => {
    expect(carNamesFromHeading(OIL_HEADING)).toEqual({
      brandNameFa: "تویوتا",
      modelNameFa: "CHR توربو 1200",
    });
  });

  it("keeps a model whose name carries its own years", () => {
    expect(
      carNamesFromHeading("روغن موتور خودرو برای تویوتا > هایلوکس 2005-2013")?.modelNameFa,
    ).toBe("هایلوکس 2005-2013");
  });

  it("handles a brand name containing Latin text", () => {
    expect(
      carNamesFromHeading("روغن موتور سیکلت برای کی تی ام KTM > دوک ادونچر Duke Adventure 250"),
    ).toEqual({
      brandNameFa: "کی تی ام KTM",
      modelNameFa: "دوک ادونچر Duke Adventure 250",
    });
  });

  it("returns null for a heading with no car in it", () => {
    expect(carNamesFromHeading("روغن موتور خودرو")).toBeNull();
  });
});

describe("sectionNameFrom", () => {
  it("strips the capacity and the car, leaving the section's own name", () => {
    expect(sectionNameFrom(OIL_HEADING)).toBe("روغن موتور خودرو");
  });

  it("handles a section with no capacity", () => {
    expect(sectionNameFrom("فیلترها برای تویوتا > CHR توربو 1200")).toBe("فیلترها");
  });
});

describe("capacityFrom", () => {
  it("takes what the parentheses hold", () => {
    expect(capacityFrom(OIL_HEADING)).toBe("با فیلتر روغن 3.9 لیتر بدون فیلتر روغن 3.6 لیتر");
    expect(capacityFrom("روغن گیربکس اتوماتیک (8.6 لیتر) برای تویوتا > CHR")).toBe("8.6 لیتر");
  });

  it("is null when the heading states none", () => {
    expect(capacityFrom("فیلترها برای تویوتا > CHR")).toBeNull();
  });
});

describe("isBareNoteLabel", () => {
  it("recognises a label with nothing after it", () => {
    expect(isBareNoteLabel("نکته :")).toBe(true);
    expect(isBareNoteLabel("نکته:")).toBe(true);
    expect(isBareNoteLabel("")).toBe(true);
  });

  it("keeps a real note", () => {
    expect(isBareNoteLabel("نکته : بهترین روغن موتور برای این خودرو")).toBe(false);
  });
});

describe("parseCarPage", () => {
  const sections: Section[] = [
    {
      heading: OIL_HEADING,
      note: "بهترین روغن موتور برای این خودرو",
      products: [
        ["روغن موتور بهران", "https://www.oil-city.ir/product/behran/"],
        ["روغن موتور HTC", "https://www.oil-city.ir/product/htc/"],
      ],
    },
    {
      heading: "فیلترها برای تویوتا > CHR توربو 1200",
      products: [["فیلتر روغن تویوتا", "https://www.oil-city.ir/product/filter-oil/"]],
    },
  ];

  it("reads the car and its sections in page order", () => {
    const { car, problems } = parseCarPage(page(sections), URL);

    expect(problems).toEqual([]);
    expect(car?.brandNameFa).toBe("تویوتا");
    expect(car?.modelNameFa).toBe("CHR توربو 1200");
    expect(car?.brandSourceSlug).toBe("toyota");
    expect(car?.modelSourceSlug).toBe("chr");
    expect(car?.sections).toHaveLength(2);
    expect(car?.sections[0].headingFa).toBe(OIL_HEADING);
    expect(car?.sections[1].headingFa).toContain("فیلترها");
  });

  it("guesses engine-oil for the car oil section only", () => {
    const { car } = parseCarPage(page(sections), URL);
    expect(car?.sections[0].categoryGuess).toBe("engine-oil");
    // "فیلترها" is cabin, oil and gearbox filters at once — no single category.
    expect(car?.sections[1].categoryGuess).toBeNull();
  });

  // The trap this guards: motorcycle oil is not car engine oil, and a fuzzy
  // match on "روغن موتور" would put bike oil in front of car owners.
  it("never treats motorcycle oil as engine oil", () => {
    const bike = [{ heading: "روغن موتور سیکلت (1.7 لیتر) برای کی تی ام KTM > دوک 200" }];
    const { car } = parseCarPage(
      page(bike, "کی تی ام KTM"),
      "https://www.oil-city.ir/car/ktm/duke/",
    );

    expect(car?.sections[0].categoryGuess).toBeNull();
    expect(car?.sections[0].headingFa).toContain("روغن موتور سیکلت");
  });

  it("takes one product per card, not one per link", () => {
    // Each card links to its product twice, from the image and from the title.
    const { car } = parseCarPage(page(sections), URL);
    const products = car?.sections[0].products ?? [];

    expect(products).toHaveLength(2);
    expect(products[0]).toEqual({
      nameFa: "روغن موتور بهران",
      productSourceUrl: "https://www.oil-city.ir/product/behran/",
      orderOnPage: 0,
    });
    expect(products[1].orderOnPage).toBe(1);
  });

  it("ignores the promo panel and the SEO article", () => {
    // #collapseOne and #collapseContent sit alongside the numbered sections and
    // are not recommendations.
    const { car } = parseCarPage(page(sections), URL);
    expect(car?.sections).toHaveLength(2);
  });

  it("records a note, and treats a bare label as none", () => {
    const { car } = parseCarPage(page(sections), URL);
    expect(car?.sections[0].specNoteFa).toContain("بهترین روغن موتور");
    expect(car?.sections[1].specNoteFa).toBeNull();
  });

  it("reports a brand disagreement without correcting either side", () => {
    const { car, problems } = parseCarPage(page(sections, "لکسوس"), URL);

    expect(problems.some((issue) => issue.includes("brand disagreement"))).toBe(true);
    // The headings' value is kept as stated, exactly like a product's brand label.
    expect(car?.brandNameFa).toBe("تویوتا");
  });

  it("reports a page with no accordion rather than emitting an empty car", () => {
    // A car with no sections is indistinguishable from one whose sections we
    // failed to find, so it is a problem rather than a record.
    const { car, problems } = parseCarPage("<html><body><h1>nothing</h1></body></html>", URL);

    expect(car).toBeNull();
    expect(problems[0]).toContain("no recommendation sections");
  });

  it("rejects a URL that is not a model page", () => {
    const { car, problems } = parseCarPage(page(sections), "https://www.oil-city.ir/car/toyota/");
    expect(car).toBeNull();
    expect(problems[0]).toContain("/car/<brand>/<model>/");
  });
});
