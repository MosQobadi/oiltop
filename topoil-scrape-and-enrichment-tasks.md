# Top Oil — Scraping & Data Enrichment — Claude Code Task List

Companion to `topoil-schema-and-import-tasks.md` and `oil-city-import-notes.md`. That list built the
_importer_; this one builds the thing that feeds it. As of writing, `scripts/import.ts` is complete —
idempotent, `--dry-run`-able, with a review queue behind it — and `scrape/oil-city/` contains exactly
one hand-written fixture of 3 products and 1 car. Every remaining hour of this project's catalog work
is on this side of the line.

## How to use this

- Same discipline as the other docs: one task = one Claude Code session = one commit, in order.
- **Task A.5 in `topoil-schema-and-import-tasks.md` is a prerequisite for Phase G.** It changes both
  the schema and the importer's year handling; running a real import before it lands means
  re-importing afterwards.
- Scrapers are throwaway-ish code that produces permanent data. Optimise for _re-runnability and a
  loud failure_, not elegance. A scraper that silently emits 200 nulls is worse than one that stops.
- Everything a scraper writes goes to `scrape/<source>/` as JSON validated by D.1's
  `parseScrapeBatchJson` (`lib/validation/import.ts`). If a scraper can't produce a file that
  validates, fix the scraper — do not loosen the schema to let bad data through.
- **Filename order is load-bearing.** `scripts/import.ts` reads a source's directory in filename
  order and each file is its own transaction, so a car referencing a product from a later file
  imports spec-only. Name product batches `01-*.json` and car batches `50-*.json`.
- `prisma/seed.ts` refuses to run against a populated database (`SEED_RESET=1` overrides). Do not
  disable that guard to make a task easier — a seed run destroyed hand-entered data once already.

---

## Decisions this list assumes

**1. Facts are imported; presentation is not.** Names, specs, prices, part categories and fitment are
factual data about products. Descriptions and product photography are the source site's own work, and
oil-city is a direct competitor. Descriptive prose and images are captured as _reference material for
the reviewer_ and must not reach the storefront as-is. This is why every imported row lands INACTIVE.

**2. Cars come from oil-city, years come from hamrah-mechanic.** oil-city publishes the fitment but no
years or types; hamrah-mechanic publishes years and types but no fitment. Importing cars from
hamrah-mechanic would mean joining two Persian name sets across ~800 models, and
`scripts/import.ts` deliberately refuses to attach scraped fitment to a car it did not create — so
the fitment would be silently dropped. Cars therefore come from oil-city, which carries the join key,
and years are applied afterwards as an enrichment pass (Task G.3).

**3. The calendar is derived from the year, not from the source.** Jalali model years (~1370-1405) and
Gregorian ones (~1990-2026) occupy disjoint numeric ranges, so any single year value identifies its
own calendar. No per-brand flag, no per-site parsing rule. Disagreement within one model goes to
review — that is the signal of a nameplate sold both Iranian-built and imported.

**4. Nothing goes live without a human.** The importer creates everything INACTIVE and D.4's review
queue is how it gets activated. No task in this list may bulk-activate rows as a convenience.

---

## Phase F — Extraction

### Task F.1 — A polite, cacheable fetcher — **BUILT**

**DoD:** `scripts/scrape/fetch.ts` fetches a URL with rate limiting and an on-disk cache; a second run
of any scraper does zero network requests; `robots.txt` is checked before the first fetch of a host.

> **Built, with two departures from the prompt below.**
>
> **It lives in `scripts/scrape/`, not `scrape/lib/`.** `.gitignore` excludes `/scrape/` wholesale, so
> scraper source placed there would never have been committed. Output still goes to
> `scrape/<source>/` and the cache to `scrape/.cache/`, both correctly ignored.
>
> **It drives real Chrome, not `fetch()`.** oil-city.ir sits behind ArvanCloud, which answers a plain
> HTTP client with a ~6KB JavaScript "Transferring to the website…" page at HTTP 200 — for every URL,
> including robots.txt and the sitemaps. `fetch()` cannot read that site at all, which invalidates the
> premise that its pages "return full content on a plain GET": that observation came from browsing in
> a real browser. Chrome gets the real thing (297KB for one car page), and the shim is polled for
> rather than slept through, so a page that arrives intact costs nothing extra. Playwright was already
> a dependency, and `channel: "chrome"` matches what `playwright.config.ts` already does.
>
> **oil-city.ir's real robots.txt**, readable only through the browser, allows `/product/…`,
> `/product-category/…`, `/car/…` and the sitemaps, and disallows `/cart`, `/checkout`, `/signin`,
> `/signup`, `/profile/*`, `/compare/*`, `/wp-admin/`, and — importantly — **`/*?`, every URL carrying
> a query string**. So enumeration must go through the sitemaps and pagination through `/page/{n}/`,
> never `?`-parameterised URLs. Search (`/?s=`) is off the table. The rules are pinned as a test case
> in `fetch.test.ts`. hamrah-mechanic.com's robots.txt allows every `/carprice/` path F.4 needs.

**Prompt:**

```
Every scraper in this phase needs the same three things, and writing them three times guarantees two
of the copies are wrong. Build them once, in `scripts/scrape/fetch.ts`. This is the only shared
abstraction this phase gets — resist adding a framework around it.

  fetchPage(url: string): Promise<string>   // returns HTML

Behaviour:
- ON-DISK CACHE, keyed by a hash of the URL, under `scrape/.cache/<host>/`. A cache hit does no
  network request. This is the point of the whole task: parsing 3,500 pages will take several
  attempts, and re-downloading the site on every attempt is both slow and rude. Add the cache
  directory to .gitignore — it is large and reproducible.
- RATE LIMIT: at most one request per second per host, serialised. No concurrency. The catalog is a
  few thousand pages; finishing in an hour instead of ten minutes costs nothing and getting the IP
  blocked mid-run costs a lot.
- RETRY: on a 5xx or a network error, retry up to 3 times with backoff. On a 4xx, do not retry —
  return the failure to the caller, which records it in the batch's "problems" array.
- ROBOTS: before the first request to a host, fetch and parse /robots.txt. If the path being
  requested is disallowed for a generic user agent, THROW with the offending rule quoted. Do not
  add a flag to bypass this. If a host disallows what we need, that is a decision for a human, not
  a runtime option.
- Set a real, honest User-Agent identifying the project and a contact address. No spoofing a browser.

Also add `scripts/scrape/README.md`, five lines, saying what this directory is and that everything
in `scrape/.cache/` is disposable.
```

### Task F.2 — oil-city product extractor

**DoD:** `pnpm tsx scripts/scrape/oil-city/products.ts` writes `scrape/oil-city/01-products-<n>.json` files
that pass `parseScrapeBatchJson`; a `--limit` flag caps pages for a test run.
**Prompt:**

```
Extract oil-city.ir's catalog into D.1's batch format. The source survey in
`oil-city-import-notes.md` section 2 is confirmed-by-browsing and is the spec for URL patterns — read
it before starting. The extraction rules in section 4 of that file were written for a human-driven
browser session; this task turns them into code, and the RULES still apply verbatim, especially:

  - NEVER invent a value. Not on the page -> null (or [] for a list).
  - NEVER translate. Persian goes in verbatim, including ZWNJ. English fields stay null.
  - NEVER derive one field from another.
  - Layout doesn't match what's expected -> push to "problems", do not improvise.

Enumerate from the Yoast sitemaps (/products-sitemap.xml and -2, -3, -4), not by crawling links.
~3,454 products across 4 sitemaps.

Emit ONE batch file per ~200 products, named `01-products-001.json` upward — the `01-` prefix keeps
products ahead of cars in the importer's filename ordering, which matters (see "How to use this").

Fill every key in the D.1 product shape. Specifically:
- `sourceSlug` — the URL's last path segment, percent-DECODED to readable Persian. Sometimes Latin,
  sometimes raw Persian; both are fine, it is the natural key either way.
- `categoryGuess` — EXACTLY one of engine-oil / oil-filter / air-filter / cabin-filter / fuel-filter,
  or null. Coolant, brake oil, ATF, shock oil, additives, air freshener and spare parts are ALL null.
  Always fill `sourceCategoryText` verbatim regardless, so a null guess loses nothing.
- `priceToman` / `originalPriceToman` — numbers, whole Toman (the site labels prices تومان, so no
  conversion). Struck-through figure is the original, highlighted one is the current. Always also
  fill `priceRawText` with both verbatim.
- `specs` — flat object of the page's spec badges, keys and values verbatim in Persian.
- `brandLabelFa` — the site's "برند :" value as printed, even when it contradicts the product title.
  Do not correct it; note the contradiction in "problems".
- `shortDescriptionFa` / `longDescriptionFa` / `imageUrls` — captured for the reviewer only. See
  decision 1: this text and these images are the source's own work and are not for publication.

`--limit <n>` caps the number of product pages fetched, for a cheap end-to-end test. Print a summary
per batch: counts, and every distinct `sourceCategoryText` seen with its frequency — that tally is
what decision D.2 in the notes deferred, and it is only actionable once it exists.
```

### Task F.3 — oil-city car + fitment extractor

**DoD:** `pnpm tsx scripts/scrape/oil-city/cars.ts` writes `scrape/oil-city/50-cars-<n>.json` files that pass
`parseScrapeBatchJson`, one car record per model page, with sections in page order.
**Prompt:**

```
Same source, same rules, same fetcher as F.2 — read that task and `oil-city-import-notes.md` first.
This one extracts the part that makes the whole project worth doing: which parts fit which car.

Enumerate from /cars-sitemap.xml. A /car/ URL with ONE path segment is a brand; TWO segments is a
model. 882 URLs total: 81 brands, 801 models. Recommendations live on the model page itself — there
is no separate fitment URL — and the accordions are pre-rendered, so a plain GET returns everything.

Emit one batch per ~50 model pages, named `50-cars-001.json` upward.

Per the D.1 car shape:
- `sections` — one per accordion, IN PAGE ORDER. `headingFa` verbatim (it contains the capacity, e.g.
  "روغن موتور خودرو (با فیلتر روغن ۴.۲ لیتر ...)"), `capacityText` pulled out where parseable but
  null rather than guessed, `specNoteFa` the نکته box verbatim, and `products` every named product in
  that section in page order with its `productSourceUrl` where linked.
- `categoryGuess` per section follows F.2's rule: one of the five slugs, or null. Never guess.
- `modelDescriptorText` — engine/drivetrain text carried in the model's own title or intro, e.g.
  "1800cc هیبرید". null if absent. The importer uses this for the synthesised type's label.

Do NOT attempt to extract years, trims or climate variants. The source has none: their recommendation
attaches to a model, and their oil notes say it holds "در هر چهار فصل". Years arrive in G.3; the
HOT/COLD split stays a manual enrichment. Inventing either here is the failure this task must avoid.

Print a summary per batch: models covered, total fitment rows, and any model page whose layout did
not match (in "problems", not silently skipped).
```

### Task F.4 — hamrah-mechanic year & type extractor

**DoD:** `pnpm tsx scripts/scrape/hamrah-mechanic/cars.ts` writes `scrape/hamrah-mechanic/*.json` in a small
purpose-built shape (NOT D.1's batch format), carrying brand, model, type label, year span and the
calendar each year was printed in.
**Prompt:**

```
oil-city has no years, so the car finder's year step is meaningless for imported cars until this
lands. hamrah-mechanic.com publishes exactly what is missing, in a structure that matches ours:

  /carprice/{brand}/{model}/{year}/{typeId}/
  e.g. /carprice/irankhodro/peugeot206/1390/163/  ->  titled "قیمت پژو 206 تیپ 3 90"

That "تیپ" IS our CarEngine — see the CarEngine note in CLAUDE.md. Brand coverage confirmed: ایران
خودرو, سایپا, پارس خودرو, مدیران خودرو, کرمان موتور, گروه بهمن, آرتابان, plus ~40 foreign brands.

This does NOT emit D.1 batch format and must not be pointed at `scripts/import.ts`. It is input for
G.3's enrichment pass only. Define its shape in `lib/validation/enrichment.ts` with Zod, mirroring
D.1's discipline — every key present on every record, nulls rather than guesses:

  { brandSlug, brandNameFa, modelSlug, modelNameFa,
    types: [ { typeLabelFa, yearStart, yearEnd, yearCalendar, sourceUrl } ],
    problems: [...] }

`yearCalendar` is DERIVED PER VALUE, not read from the page: 1300-1450 is JALALI, 1900-2100 is
GREGORIAN, anything else is a problem to record. This works because the ranges are disjoint. If a
model's own rows disagree, emit them as they are with the calendar each one derived to — do not pick
a winner, do not normalise. G.3 sends the disagreement to review.

WATCH OUT: a single model page lists used cars by Jalali year AND zero-km ("صفر") cars by Gregorian
model year, in different sections. A naive read produces spans like "از 1404 تا 2024", which is two
sections collapsed, not a real span. Record which section each year came from and never build a span
that crosses calendars.

Start with the Iranian makers — ایران خودرو, سایپا, پارس خودرو — which are most of the cars on the
road and most of your traffic. Foreign brands are a later run and a lower priority; for those, a
commercial vehicle-data API is a legitimate alternative to scraping.
```

---

## Phase G — Landing it

**Prerequisite: Task A.5 must be complete before anything in this phase runs.**

### Task G.1 — Probe import

**DoD:** One product batch and one car brand imported with `--dry-run` against a real scrape; a short
written findings note; no schema or importer changes made in this task.
**Prompt:**

```
The importer was written against a 3-product fixture, not real data. Before committing to 800 models,
find out what real data breaks. This task is DELIBERATELY read-only: run, observe, write down. Fixes
are separate commits, informed by what this finds.

1. Run F.2 with `--limit` to produce ONE product batch, and F.3 restricted to ONE car brand — pick a
   brand with several models and a mix of part types.
2. `pnpm tsx scripts/import.ts --source oil-city --dry-run`
3. Run it a SECOND time. The report must say "unchanged" for everything, not re-create it. If a dry
   run is not idempotent, that is the finding.

What to look at, in order of how expensive it is to discover later:
- Slug generation. `lib/slug.ts` strips non-[a-z0-9], so slugify("فیلتر روغن") returns "". Every
  product and model with a Persian-only source slug exercises the fallback path. Are the results
  unique, stable across runs, and URL-usable?
- Spec key and fuel-type tables. Both report what they did not recognise rather than guessing —
  read that list. It is expected to be long on a first real batch.
- The category tally from F.2. How many products fall outside our five categories, and what are they?
- Brand adoption. Did any imported brand adopt a hand-entered one it shouldn't have, or create a
  duplicate of one it should have adopted?
- Fitment resolution. How many sections resolved to real products vs. spec-only? Spec-only because
  the product is in a later batch file is expected; spec-only because the name never matches is not.
- The calendar derivation from A.5, on rows where oil-city gave no year at all.

Write the findings into `oil-city-import-notes.md` as a new section. Do not fix anything here.
```

### Task G.2 — Full import run

**DoD:** All oil-city batches imported for real; row counts recorded; every created row INACTIVE.
**Prompt:**

```
Run the full scrape and the full import. This is an operations task, not a coding one — if it needs
code changes, stop and do them as their own commit first.

1. Full F.2 and F.3 runs. Expect this to take hours at one request per second. Confirm every emitted
   file passes `parseScrapeBatchJson` before importing any of them.
2. `--dry-run` over the complete set. Read the report. Row counts in the right order of magnitude:
   ~3,400 products, ~81 car brands, ~801 models.
3. Real run.
4. Immediately re-run with `--dry-run` and confirm it reports everything unchanged. A second run that
   wants to rewrite rows means an update is not diffing correctly, and that is a bug to fix now,
   while there is one source in the database rather than three.
5. Record final counts, and the profile-dedup ratio from D.3 — how many distinct FitmentProfiles the
   801 models collapsed into. That number is the entire argument for this phase.

Do not activate anything. Do not "quickly fix" data by hand in the admin panel during this task.
```

### Task G.3 — Year enrichment applier

**DoD:** `pnpm tsx scripts/enrich-years.ts --dry-run` reports proposed year spans; the real run writes
ONLY year fields, ONLY to rows carrying an `oil-city:` sourceRef, and flags every unmatched or
conflicting model for review.
**Prompt:**

```
`scripts/import.ts` writes a car type's year span at CREATE time only and never updates it, and it
refuses to write to any row it did not create. Both rules are deliberate and must not be relaxed. So
the hamrah-mechanic data CANNOT be a second import source — it is an update to oil-city-owned rows,
which is exactly what the importer exists to refuse. It needs its own script.

`scripts/enrich-years.ts` reads `scrape/hamrah-mechanic/*.json` (F.4's shape) and updates year spans
on cars the oil-city import created. Constraints, all of them load-bearing:

- It may write ONLY `yearStart`, `yearEnd` and `yearCalendar`. Not names, not slugs, not status, not
  fitment. Anything else is out of scope and a bug.
- It may write ONLY to CarModel/CarEngine rows whose sourceRef starts with `oil-city:`. A
  hand-entered car was entered by someone who knew the years; leave it alone.
- `--dry-run` is required and works the same way as the importer's: real code path, transaction
  rolled back, a report of every proposed change.
- It NEVER widens a span a human has narrowed. If a row's span differs from the imported placeholder
  (A.5's IMPORTED_YEAR_START, per calendar), a human has touched it — skip and report.

Matching is the hard part and must fail loudly, not creatively:
- Match on normalised Persian model name within a matched brand. Normalise ZWNJ, Arabic vs Persian
  ye/kaf, and digit forms — nothing more. No fuzzy distance matching, no transliteration.
- Unmatched model -> report it, change nothing. Expect a long list; that list is the task's real
  output and the input to a human pass.
- A model whose source rows derived to BOTH calendars -> do not choose. Flag it for D.4's review
  queue and leave the span alone. This is the Kia/Saipa case: the same nameplate sold both
  Iranian-built (Jalali) and imported (Gregorian).
- One hamrah-mechanic type mapping to several of our types, or vice versa -> report, skip.

Print, at the end: matched, unmatched, skipped-human-edited, calendar-conflict. Four numbers.
```

### Task G.4 — Review and activate

**DoD:** A documented, repeatable review pass; the highest-traffic cars reviewed and activated; the
long tail explicitly left INACTIVE.
**Prompt:**

```
D.4 built the review queue. This task uses it, and writes down how, so the next person does it the
same way.

Do NOT review 800 models. Review in traffic order and stop when it stops paying:
  Pride, Peugeot 206 / 405 / Pars, Samand, Tiba, Quick, Saina, Dena, Shahin, L90/Tondar,
  then common imports (Hyundai, Kia, Toyota).

For each car reviewed, the checklist is:
- Is the recommendation plausible? A wrong oil recommendation damages an engine. This is the one
  place in this whole project where "the import said so" is not good enough.
- Does the year span make sense in its own calendar, and is it contiguous with the model's other
  types? A gap between spans means a customer with a car in that gap matches nothing — see the
  CarEngine notes in CLAUDE.md.
- Are the descriptions and images the source's own? Per decision 1, they do not ship. Rewrite or
  clear before activating.
- Are the HOT/COLD oil variants worth adding for this car? The source has none.

Write the checklist into `docs/` as a short runbook, so this is repeatable by someone who did not
read this task. Record how many cars were activated and where you stopped.
```

---

## Not in scope here

- **OEM part numbers.** Confirmed absent from oil-city — they appear only as print on product
  photographs. OEM search will not find imported products, and no amount of scraping fixes it.
- **HOT/COLD climate variants.** The source recommends one oil "در هر چهار فصل". Manual enrichment.
- **Foreign-brand car taxonomy.** F.4 covers Iranian makers first by design. For imported cars, a
  commercial vehicle-data API is cleaner than scraping and should be priced before more scraper work.
