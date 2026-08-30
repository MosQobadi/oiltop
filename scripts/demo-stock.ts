// Gives the catalog believable stock levels so the storefront can be looked at
// with its buy buttons showing.
//
//   pnpm tsx scripts/demo-stock.ts --dry-run
//   pnpm tsx scripts/demo-stock.ts
//   pnpm tsx scripts/demo-stock.ts --clear
//
// **Why this is needed to look at anything.** 2,315 active products and 16 of
// them in stock meant every card in the catalog fell through to the out-of-stock
// branch — the outlined "Notify me" — so a change to the *Add to cart* button
// was invisible on every page it appears on.
//
// The spread is deliberate rather than "everything in stock": roughly a fifth
// land under `LOW_STOCK_THRESHOLD` and a tenth at zero, so a page shows all
// three StockBadge states and both CTA shapes without anyone hunting for them.
//
// Deterministic, from a hash of the product id: a re-run leaves every product on
// the number it had, so screenshots stay comparable and nothing shuffles.

import { prisma } from "../lib/db";

// FNV-1a. Any stable hash would do — this one is short and needs no import.
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// 10% out of stock, 20% low (1–9, under the storefront's threshold of 10),
// 70% comfortably in stock.
function stockFor(productId: string): number {
  const h = hash(productId);
  const bucket = h % 100;
  if (bucket < 10) return 0;
  if (bucket < 30) return 1 + ((h >>> 7) % 9);
  return 12 + ((h >>> 7) % 79);
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const clear = argv.includes("--clear");
  for (const arg of argv) {
    if (arg !== "--dry-run" && arg !== "--clear") {
      throw new Error(`Unknown argument "${arg}". Usage: [--dry-run] [--clear]`);
    }
  }

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
  });

  const counts = { out: 0, low: 0, in: 0 };
  for (const { id } of products) {
    const stock = clear ? 0 : stockFor(id);
    if (stock === 0) counts.out += 1;
    else if (stock < 10) counts.low += 1;
    else counts.in += 1;

    if (dryRun) continue;
    // Inventory is 1:1 with a product but not every product has a row yet, so
    // this creates the missing ones rather than assuming the seed made them.
    await prisma.inventory.upsert({
      where: { productId: id },
      create: { productId: id, stock, lastUpdatedAt: new Date() },
      update: { stock, lastUpdatedAt: new Date() },
    });
  }

  console.log(`${products.length} active product(s)`);
  console.log(`  in stock:     ${counts.in}`);
  console.log(`  low stock:    ${counts.low}`);
  console.log(`  out of stock: ${counts.out}`);
  if (dryRun) console.log("\n--dry-run: nothing written.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
