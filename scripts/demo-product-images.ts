// Puts a stand-in image on products so the storefront can be looked at with
// artwork in it rather than a grid of placeholders.
//
//   pnpm tsx scripts/demo-product-images.ts --file /uploads/demo-bottle.jpg
//   pnpm tsx scripts/demo-product-images.ts --brand-logos
//   pnpm tsx scripts/demo-product-images.ts --clear
//
// `--file` puts one image on every ACTIVE product. That is obviously not a
// catalog — it is a way to see the card design against a real photograph at the
// scale it actually runs at, which a grid of placeholders cannot show.
// The path is a public URL, not a filesystem path: whatever `ImageUploadField`
// would have stored, e.g. `/uploads/<name>.jpg` for a file in `public/uploads`.
//
// `--brand-logos` is the narrower version: each hand-entered product borrows its
// own brand's logo. Useful when you want the seeded products to look distinct
// from one another rather than all showing the same bottle.
//
// `--clear` puts every product back to no image.
//
// None of this is product photography and none of it should outlive the design
// work. Real shots belong on a white ground — see CLAUDE.md.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/db";

interface Options {
  file: string | null;
  brandLogos: boolean;
  clear: boolean;
}

function parseArgs(argv: string[]): Options {
  let file: string | null = null;
  let brandLogos = false;
  let clear = false;

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--brand-logos") brandLogos = true;
    else if (argv[i] === "--clear") clear = true;
    else if (argv[i] === "--file") {
      file = argv[i + 1] ?? null;
      i += 1;
    } else {
      throw new Error(
        `Unknown argument "${argv[i]}".\n\n` +
          `Usage: --file /uploads/<name>.jpg | --brand-logos | --clear`,
      );
    }
  }

  const modes = [file !== null, brandLogos, clear].filter(Boolean).length;
  if (modes !== 1) {
    throw new Error("Pass exactly one of --file <public path>, --brand-logos, --clear.");
  }
  return { file, brandLogos, clear };
}

// Checked here rather than discovered as a grid of broken images later: the path
// is a URL under `public/`, so it has to start with a slash and exist on disk.
function assertPublicFile(publicPath: string) {
  if (!publicPath.startsWith("/")) {
    throw new Error(
      `--file takes a public URL, not a filesystem path: "/uploads/x.jpg", not "public/uploads/x.jpg".`,
    );
  }
  const onDisk = join("public", publicPath.slice(1));
  if (!existsSync(onDisk)) {
    throw new Error(`No such file: ${onDisk}\nPut the image under public/ and pass its URL.`);
  }
}

async function main() {
  const { file, brandLogos, clear } = parseArgs(process.argv.slice(2));

  if (file !== null) {
    assertPublicFile(file);
    const { count } = await prisma.product.updateMany({
      where: { status: "ACTIVE" },
      data: { image: file },
    });
    console.log(`Set ${file} on ${count} active product(s).`);
    return;
  }

  if (clear) {
    const { count } = await prisma.product.updateMany({
      where: { image: { not: null } },
      data: { image: null },
    });
    console.log(`Cleared the image on ${count} product(s).`);
    return;
  }

  if (!brandLogos) return;

  // Scoped to hand-entered rows (`sourceRef: null`), so a re-import can't be
  // confused by it and the imported catalog is left alone.
  const products = await prisma.product.findMany({
    where: { sourceRef: null },
    select: { id: true, nameEn: true, image: true, brand: { select: { logo: true } } },
  });

  let changed = 0;
  for (const product of products) {
    const next = product.brand?.logo ?? null;
    if (next === null || next === product.image) continue;
    await prisma.product.update({ where: { id: product.id }, data: { image: next } });
    changed += 1;
  }
  console.log(`Set a brand logo on ${changed} of ${products.length} hand-entered product(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
