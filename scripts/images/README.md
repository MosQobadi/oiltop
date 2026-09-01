# scripts/images

Puts real photographs on the catalog. Output goes to `public/uploads/catalog/`,
which `.gitignore` excludes along with the rest of `public/uploads` — the images
are reproducible from the scrape data plus `scrape/.cache/`, not source.

```bash
pnpm tsx scripts/images/product-images.ts --dry-run    # what a run would cover
pnpm tsx scripts/images/product-images.ts --limit 300  # do it
pnpm tsx scripts/images/product-images.ts --clear      # detach them all again
```

Three files, one idea each:

- `sources.ts` — **which** products get one. Ranked by where their category sits
  on a car's results page, then by how often fitment recommends them. Read the
  comment at the top before changing the ordering; the obvious ranking is wrong
  and the note explains how.
- `normalize.ts` — **what shape** the image ends up. One 800px white square per
  product, and a set of gates that reject a photo rather than let a bad one onto
  the shelf. `normalize.test.ts` covers every gate.
- `product-images.ts` — the CLI that joins the two.

Network access goes through `scripts/scrape/fetch.ts`, same as the scrapers:
same cache, same one-request-per-second, same robots.txt with no override.

Re-running is cheap and safe. Filenames are a hash of the image's own bytes, so
products sharing a photograph share a file and a second run re-attaches the same
paths without touching the network.

**This does not cover cars.** `CarBrand.logo`, `CarModel.image` and
`CarEngine.image` are still empty, and they need a different source — oil-city
publishes no car photography at all.
