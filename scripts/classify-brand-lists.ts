// Decides which Brand rows the storefront shows *as brands* — the homepage wall
// and the PLP / category filter rails — by setting `Brand.showInBrandLists`.
//
//   pnpm tsx scripts/classify-brand-lists.ts --dry-run
//   pnpm tsx scripts/classify-brand-lists.ts
//   pnpm tsx scripts/classify-brand-lists.ts --restore
//
// **Why this exists.** The importer mints one Brand per "برند :" label the
// source printed. For an OEM part that label is the car the part fits, not who
// made it, so the table ends up holding rows named هیوندای (556 products), کیا
// (287), پراید, دنا. Those products are real and must stay purchasable, and
// `server/order.ts` will only sell a product whose brand is ACTIVE — so the
// rows have to stay ACTIVE. This flag is what keeps them out of the brand wall
// without taking their products off the storefront.
//
// Nothing here touches `status`, and nothing here touches a product. Re-run it
// after any import; `--restore` puts every row back to shown.

import { prisma } from "../lib/db";

// Rows whose name the car catalog does not match, because the source spelled
// the car differently than the Cars section does ("بنز" vs "مرسدس بنز"), or
// because the label is two makes run together where the source printed
// "کیا و هیوندای". Matched on nameFa, exactly, after whitespace collapsing.
const ALSO_NOT_PRODUCT_BRANDS = [
  "بنز",
  "جک",
  "بسترن",
  "کاپرا",
  "دیگنیتی",
  "سایک موتور",
  "دنا",
  "پراید",
  "رانا",
  "ریو",
  "آریو",
  "فیدلیتی",
  "بنلی",
  "CFMOTO",
  // Two makes run together — a label the source printed as one string.
  "کیاهیوندای",
  "آئودیفولکس واگن",
  "چانگانلیفان",
];

// The importer's holding row for a product whose brand it could not read. It is
// a bucket, not a brand, and it currently carries 243 products — the same
// reasoning that keeps `imported-uncategorised` off the storefront.
const HOLDING_BRAND_SLUGS = ["imported-unknown-brand"];

const normalise = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

async function carNames(): Promise<Set<string>> {
  const [brands, models] = await Promise.all([
    prisma.carBrand.findMany({ select: { nameFa: true, nameEn: true } }),
    prisma.carModel.findMany({ select: { nameFa: true, nameEn: true } }),
  ]);
  const names = new Set<string>();
  for (const row of [...brands, ...models]) {
    for (const name of [row.nameFa, row.nameEn]) {
      const key = normalise(name);
      if (key !== "") names.add(key);
    }
  }
  return names;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const restore = argv.includes("--restore");
  for (const arg of argv) {
    if (arg !== "--dry-run" && arg !== "--restore") {
      throw new Error(`Unknown argument "${arg}". Usage: [--dry-run] [--restore]`);
    }
  }

  if (restore) {
    const { count } = await prisma.brand.updateMany({
      where: { showInBrandLists: false },
      data: { showInBrandLists: true },
    });
    console.log(`Restored ${count} brand(s) to the storefront brand lists.`);
    return;
  }

  const [brands, cars] = await Promise.all([
    prisma.brand.findMany({
      select: {
        id: true,
        slug: true,
        nameFa: true,
        nameEn: true,
        showInBrandLists: true,
        _count: { select: { products: true } },
      },
    }),
    carNames(),
  ]);

  const supplement = new Set(ALSO_NOT_PRODUCT_BRANDS.map(normalise));
  const holding = new Set(HOLDING_BRAND_SLUGS);

  const hide: { name: string; products: number; why: string }[] = [];
  const hideIds: string[] = [];
  const showIds: string[] = [];

  for (const brand of brands) {
    let why: string | null = null;
    if (holding.has(brand.slug)) why = "holding bucket";
    else if (cars.has(normalise(brand.nameFa)) || cars.has(normalise(brand.nameEn)))
      why = "names a car in the catalog";
    else if (supplement.has(normalise(brand.nameFa))) why = "listed as not-a-product-brand";

    if (why === null) {
      showIds.push(brand.id);
    } else {
      hideIds.push(brand.id);
      hide.push({ name: brand.nameFa, products: brand._count.products, why });
    }
  }

  hide.sort((a, b) => b.products - a.products);
  console.log(`Hidden from the storefront brand lists (${hide.length}):`);
  for (const row of hide) {
    console.log(`  ${String(row.products).padStart(4)} products  ${row.name}  — ${row.why}`);
  }
  console.log("");
  console.log(`Shown as product brands: ${showIds.length}`);
  console.log("Products, prices and purchasability are unchanged for every row above.");

  if (dryRun) {
    console.log("");
    console.log("--dry-run: nothing written.");
    return;
  }

  // Both directions, so a re-run after a correction to the lists above settles
  // the whole table rather than only ever hiding more of it.
  const [hidden, shown] = await Promise.all([
    prisma.brand.updateMany({ where: { id: { in: hideIds } }, data: { showInBrandLists: false } }),
    prisma.brand.updateMany({ where: { id: { in: showIds } }, data: { showInBrandLists: true } }),
  ]);
  console.log("");
  console.log(`Wrote ${hidden.count} hidden, ${shown.count} shown.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
