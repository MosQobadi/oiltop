// Which calendar a given car is sold by, decided per brand with per-model
// exceptions.
//
// `lib/year.ts` explains why both calendars exist and why years are stored as
// written. This file answers the question that one cannot: *which* calendar a
// particular car belongs to. `calendarForYear` can only read digits — it says
// 1390 is Jalali and 2011 is Gregorian — so it is right about the years it is
// handed and useless for a car whose years are still the importer's
// placeholder, which is 423 of the 809 types in the catalog.
//
// **The rule is how the Iranian market quotes the car, not where it was
// built.** Those usually agree, and where they don't the market wins:
//
//   - An Iranian marque is quoted in Jalali — «سمند مدل ۱۳۹۵».
//   - A Chinese marque sold here as a domestic product is quoted in Jalali too,
//     because that is what it is to the customer: «ام وی ام X33 مدل ۱۳۸۹».
//   - A Korean, Japanese or European marque is quoted in Gregorian *even when
//     a batch was assembled here* — the Kerman Motor Accent is «اکسنت مونتاژ
//     2017», never 1396, and the same goes for the i10.
//
// Renault is the one marque that sits on both sides, and it splits the way the
// cars were sold: Tondar 90, Sandero and Megane were Pars Khodro / IKCO
// products quoted in Jalali; everything else was imported and quoted in
// Gregorian. MG is the mirror case and a common mistake — Diar Khodro imported
// them built-up rather than assembling them, so the whole marque is Gregorian.
//
// Keyed on `nameFa` because that is the only stable human key the car tables
// have: slugs on imported rows are generated hashes (`car-model-e879701ad7`),
// and ids are per-database. A name that isn't listed returns null, which means
// "not classified" — callers fall back to reading the years, they do not guess.

import type { YearCalendar } from "../year";

/**
 * The calendar a brand's cars are quoted in, absent a model-level exception.
 * A brand missing from this map is unclassified, not Gregorian.
 */
const BRAND_CALENDAR: Record<string, YearCalendar> = {
  // Iranian marques.
  "ایرانخودرو": "JALALI",
  "سایپا": "JALALI",
  "پیکان": "JALALI",
  "آمیکو": "JALALI",
  "ریگان": "JALALI",
  "فردا موتور FMC": "JALALI",
  "مکث موتور": "JALALI",
  "لاماری": "JALALI",
  "شاهین موتور": "JALALI",
  "کویر موتور": "JALALI",
  "دینو موتور": "JALALI",
  "کبیر موتور": "JALALI",
  "همتاز موتور": "JALALI",
  "اکستریم": "JALALI",

  // Foreign marques sold here as domestic products — assembled in Iran and
  // quoted in Jalali. Several of these already hold Jalali spans the source
  // gave them, which is the market's own answer.
  "ام وی ام": "JALALI",
  "چری": "JALALI",
  "فونیکس": "JALALI",
  "برلیانس": "JALALI",
  "کرمان موتور": "JALALI",
  "گروه بهمن": "JALALI",
  "زوتی (آریو Z300)": "JALALI",
  "هایما": "JALALI",
  "لیفان": "JALALI",
  "دوو": "JALALI",
  "بی وای دی": "JALALI",
  "دانگ فنگ": "JALALI",
  "فاو بسترن": "JALALI",
  "بایک": "JALALI",
  "پروتون": "JALALI",
  "بیسو": "JALALI",
  "هن تنگ": "JALALI",
  "فوتون": "JALALI",
  "اس دبلیو ام SWM": "JALALI",
  "دایون": "JALALI",
  "مزدا": "JALALI", // the Bahman-built cars; the imported Mazda 3 is a type-level exception
  "پژو": "JALALI", // IKCO-built; the imports are listed below
  "جیلی": "JALALI",
  "گریت وال": "JALALI",
  "هاوال": "JALALI",
  "چانگان": "JALALI",

  // Imported marques, quoted in Gregorian.
  "هیوندای": "GREGORIAN",
  "کیا": "GREGORIAN",
  "تویوتا": "GREGORIAN",
  "لکسوس": "GREGORIAN",
  "نیسان": "GREGORIAN",
  "میتسوبیشی": "GREGORIAN",
  "سوزوکی": "GREGORIAN",
  "هوندا": "GREGORIAN",
  "سانگ یانگ": "GREGORIAN",
  "بی ام و": "GREGORIAN",
  "مرسدس بنز": "GREGORIAN",
  "آئودی": "GREGORIAN",
  "پورشه": "GREGORIAN",
  "فولکس واگن": "GREGORIAN",
  "ولوو": "GREGORIAN",
  "آلفارومئو": "GREGORIAN",
  "مازراتی": "GREGORIAN",
  "فیات": "GREGORIAN",
  "اپل": "GREGORIAN",
  "اشکودا": "GREGORIAN",
  "دی اس": "GREGORIAN",
  "سیتروئن": "GREGORIAN",
  "رنو": "GREGORIAN",
  "ام جی": "GREGORIAN", // imported built-up by Diar Khodro, never assembled here
  "ایسوزو": "GREGORIAN",
  "یوآز": "GREGORIAN",
  "لندرور-پاژن": "GREGORIAN",
  "جتا Jetta": "GREGORIAN",
  "GAC": "GREGORIAN",
  "GWM": "GREGORIAN",
  "وویا": "GREGORIAN",
  "بورگوارد": "GREGORIAN",
  "ارس": "GREGORIAN",

  // Imported two-wheeler marques.
  "یاماها": "GREGORIAN",
  "وسپا": "GREGORIAN",
  "پیاجیو": "GREGORIAN",
  "آپریلیا": "GREGORIAN",
  "کی تی ام KTM": "GREGORIAN",
  "زونتس": "GREGORIAN",
  "کیو جی موتور": "GREGORIAN",
  "تی وی اس": "GREGORIAN",
  "باجاج": "GREGORIAN",
  "هیرو": "GREGORIAN",
  "CF MOTO": "GREGORIAN",
  "SYM": "GREGORIAN",
};

/**
 * Models that go the other way from their brand, by `nameFa`.
 *
 * Every entry is a car the brand's own default gets wrong, and each one is a
 * real split in how the car reached the customer — an import under a domestic
 * marque, or a domestic product under an imported one.
 */
const MODEL_EXCEPTIONS: Record<string, Record<string, YearCalendar>> = {
  // Imported Peugeots among the IKCO-built ones. The 2008 sits here rather
  // than in the Jalali default despite holding Jalali spans today.
  "پژو": {
    "2008": "GREGORIAN",
    "407": "GREGORIAN",
    "508": "GREGORIAN",
  },
  // Pars Khodro / IKCO Renaults among the imports.
  "رنو": {
    "تندر 90": "JALALI",
    "ساندرو": "JALALI",
    "مگان": "JALALI",
  },
  // Saipa built the Xantia and the C3; the C5 was imported.
  "سیتروئن": {
    "زانتیا": "JALALI",
    "C3": "JALALI",
  },
  // Zamyad's pickups and the Pars Khodro Roniz, under an imported marque.
  "نیسان": {
    "وانت": "JALALI",
    "پیکاپ دوکابین تک دیفرانسیل": "JALALI",
    "پیکاپ دوکابین دو دیفرانسیل": "JALALI",
    "رونیز": "JALALI",
  },
  // The Ramak Khodro Musso was sold as a domestic product; the rest were not.
  "سانگ یانگ": {
    "موسو": "JALALI",
  },
  // Recent built-up imports under marques that were assembled here earlier.
  "جیلی": {
    "آزکارا": "GREGORIAN",
  },
  "هاوال": {
    "H8": "GREGORIAN",
    "H9": "GREGORIAN",
  },
  // BYD assembled the F3 and S6 here; the current cars are built-up imports.
  "بی وای دی": {
    "سانگ": "GREGORIAN",
    "دیسترویر 05 Destroyer": "GREGORIAN",
  },
  "چانگان": {
    "CS55": "GREGORIAN",
    "Uni K یونی کی": "GREGORIAN",
    "Uni T یونی وی": "GREGORIAN",
    "Uni V یونی وی": "GREGORIAN",
    "اوشان X5": "GREGORIAN",
  },
};

/**
 * The calendar this car is quoted in, or null when it is not classified.
 *
 * Null is a normal answer — a brand nobody has ruled on yet — and callers are
 * expected to fall back to whatever they did before rather than guess.
 */
export function calendarForCar(brandNameFa: string, modelNameFa: string): YearCalendar | null {
  const exception = MODEL_EXCEPTIONS[brandNameFa]?.[modelNameFa];
  if (exception !== undefined) return exception;
  return BRAND_CALENDAR[brandNameFa] ?? null;
}

/** Whether this car is quoted in Jalali. False for unclassified cars. */
export function isJalaliCar(brandNameFa: string, modelNameFa: string): boolean {
  return calendarForCar(brandNameFa, modelNameFa) === "JALALI";
}

// Jalali and Gregorian model years for the same car are 621 apart at the year
// label level — «پژو 2008 مدل ۱۳۹۶» and «مدل 2017» name the same car. This is
// deliberately NOT a date conversion (see lib/year.ts): it re-labels a year
// that was recorded in the wrong calendar, which is only ever correct for a
// car this file has classified.
const CALENDAR_OFFSET = 621;

/**
 * The same model year written in the other calendar.
 *
 * Only for correcting a year stored under the wrong calendar. Never call it to
 * display a year — a Jalali year and its Gregorian label are two names for one
 * model year, not two dates, and converting for display is what `lib/year.ts`
 * exists to prevent.
 */
export function relabelYear(year: number, to: YearCalendar): number {
  return to === "GREGORIAN" ? year + CALENDAR_OFFSET : year - CALENDAR_OFFSET;
}
