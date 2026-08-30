// Puts a stand-in image on the seeded products so the storefront can be looked
// at with artwork in it rather than a grid of placeholders.
//
//   pnpm tsx scripts/demo-product-images.ts
//   pnpm tsx scripts/demo-product-images.ts --clear
//
// **These are not product photographs.** Each product borrows its own brand's
// logo, which is already on file and already on a white ground. That is enough
// to judge how a card handles a white-background image — the question the real
// photography will also have to answer — and no more than that. Real shots are
// their own job.
//
// Scoped to hand-entered products (`sourceRef: null`), so a re-import can't be
// confused by it and the 2,300 imported rows are left exactly as they are.

import { prisma } from "../lib/db";

async function main() {
  const clear = process.argv.slice(2).includes("--clear");

  const products = await prisma.product.findMany({
    where: { sourceRef: null },
    select: { id: true, nameEn: true, image: true, brand: { select: { logo: true } } },
  });

  let changed = 0;
  for (const product of products) {
    const next = clear ? null : (product.brand?.logo ?? null);
    if (next === product.image) continue;
    // `--clear` is deliberately unconditional: it puts every hand-entered
    // product back to no-image, which is the state this script found them in.
    if (!clear && next === null) continue;

    await prisma.product.update({ where: { id: product.id }, data: { image: next } });
    console.log(`  ${clear ? "cleared" : "set    "}  ${product.nameEn}`);
    changed += 1;
  }

  console.log(`\n${changed} product(s) updated, of ${products.length} hand-entered.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
