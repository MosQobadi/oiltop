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

### Task F.2 — oil-city product extractor — **BUILT**

**DoD:** `pnpm tsx scripts/scrape/oil-city/products.ts` writes `scrape/oil-city/01-products-<n>.json` files
that pass `parseScrapeBatchJson`; a `--limit` flag caps pages for a test run.

> **Built.** Sitemaps enumerate **3,469 unique product URLs** across four files, matching the survey's
> ~3,454. `product-page.ts` is the pure parser (HTML in, record out, testable over the cache);
> `products.ts` is the CLI. `cheerio` added as a devDependency — parsing in Node rather than in the
> browser is what keeps the disk cache worth having, since a selector fix then costs no traffic.
>
> **The page's JSON-LD is a trap and is deliberately unused.** It looks authoritative and is mostly
> wrong: `offers.price` / `lowPrice` / `highPrice` are `0` on every product checked, including ones
> displaying a real price; `description` is one site-wide marketing sentence repeated everywhere; and
> `sku` / `mpn` are the WordPress post id. Reading `oemPartNumbers` out of `mpn` would have invented
> part numbers wholesale — mismatch 3.3 stands, this source has none.
>
> **Three other traps, each now a test.** Related products further down a page carry their own
> `.price_box`, so every price lookup is scoped to `.product_d_right` or products get priced at their
> neighbour's cost. The description tab falls back to the product's own name or `"قیمت و خرید <name>"`,
> which is a placeholder rather than a description. And `categoryGuess` matches the source's own
> taxonomy slug **exactly** — their `oil-filter-heavy`, `air-filter-heavy`, `fuel-filter-heavy`,
> `battery-filter`, `gearbox-filter` and `bike-oil-engine` are not our car parts despite the similar
> names, and all correctly resolve to null.
>
> Verified against real pages: discounted in-stock oils parse to the right current and original price,
> with full specs (`برند`, `نوع`, `کیفیت`, `درجه گرانروی`, `حجم`) — which is what A.3's `viscosity` and
> `apiGrade` columns need. Out-of-stock products get a null price rather than a zero.
>
> **Still to do at full scale:** the run is long (a real browser plus a 1/sec rate limit over 3,469
> pages), and much of the catalog is out of stock, so most imported products will land with no price.

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

### Task F.3 — oil-city car + fitment extractor — **BUILT**

**DoD:** `pnpm tsx scripts/scrape/oil-city/cars.ts` writes `scrape/oil-city/50-cars-<n>.json` files that pass
`parseScrapeBatchJson`, one car record per model page, with sections in page order.

> **Built.** `cars-sitemap.xml` gives **884 car URLs — 81 brands, 803 models**, matching the survey.
> `car-page.ts` is the pure parser, `cars.ts` the CLI. Sections come from `#headingN` / `#collapseN`
> pairs with a numeric suffix; `#collapseOne` and `#collapseContent` are a promo panel and the SEO
> article, and are skipped.
>
> **Two structural facts that change what the importer receives.**
>
> **"فیلترها" is ONE section holding every filter type** — cabin, oil and gearbox filters side by
> side — not a section per filter. So a filter section carries no `categoryGuess`, and which filter
> is which is settled downstream from each product's own page. `productSourceUrl` therefore matters
> far more than the section guess, which makes the filename ordering (products before cars)
> load-bearing rather than merely tidy.
>
> **The car has no breadcrumb and no name element.** The `<h1>` holds the brand in an `<a class="badge">`
> plus prose that varies by model ("روغن موتور هایلوکس" on one, "هانک 150" on another), so it cannot
> give the model name. Every section heading instead restates the car as `... برای <brand> > <model>`,
> and that is where both names come from — cross-checked against the badge, with a disagreement
> reported and neither side corrected.
>
> `modelDescriptorText` is always null: what a descriptor would hold ("توربو 1200", "2005-2013") is
> already inside `modelNameFa`, and splitting one out would be deriving a field rather than reading one.
>
> **Only "روغن موتور خودرو" maps to a category.** "روغن موتور سیکلت" is MOTORCYCLE oil — a fuzzy match
> on "روغن موتور" would put bike oil in front of car owners, so the match is exact and everything else
> is null with its heading kept verbatim.
>
> **Worth knowing before the full run:** one car page carries far more than the five categories. The
> Toyota CHR alone has 9 sections and 91 recommended products, including 27 additives and 16 air
> fresheners. All of it is recorded, none of it is guessed at, and most of it will import into the
> holding category — which is a lot of fitment rows for the review pass to look past.
>
> **Also before a real import:** `scrape/oil-city/batch-01.json`, the original hand-made fixture,
> still sits in the output directory and sorts LAST in filename order. It would import 3 products and
> 1 car after the real cars. Move or delete it before Task G.2.

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

### Task F.4 — hamrah-mechanic year & type extractor — **DONE**

> **Built and run 2026-08-24.** `scripts/scrape/hamrah-mechanic/models.ts` reads **590 models across
> 77 makers, 7 problems**, into the enrichment shape (`lib/validation/enrichment.ts`) — never D.1's
> batch format, and never fed to the importer.
>
> **The span comes from the model index page's own title**, which every one carries: "قیمت سمند LX صفر
> و کارکرده 1382-1401". That is one span per model, which is the granularity the imported cars can
> actually use. The per-type pages below it (`/type-161`) carry narrower spans and would have invited
> exactly the join problem this avoids — our imported cars have no types to match them against.
>
> **Two things about the names.** They include the maker ("پژو 405 SLX"), which is load-bearing: it
> lets the match run against our `carBrand.nameFa + " " + carModel.nameFa` with no mapping between two
> sets of brand slugs — a mapping that would have been wrong immediately, since hamrah files Peugeots
> under `irankhodro` while oil-city calls the brand "پژو". And the title parser takes the name as
> everything _before_ the span rather than stripping words off the end: an alternation on "و" for
> "صفر و کارکرده" also matches the final letter of "پژو" and truncated every Peugeot to "پژ".

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

**Phase G now runs BEFORE Task F.4, reversing the order this list was written in.**
F.4 exists to feed G.3, and G.3 can only update car rows that the oil-city import
has already created — so F.4's output has nowhere to go until G.2 has run. G.1
also found that oil-city's model names carry their own years constantly
("یاریس 2005-2012 اتوماتیک", "کمری بنزینی 2023-2025 موتور 2000"), which may make
F.4 much smaller than planned or unnecessary for most cars. Measure that against
all 803 models after G.2 before building it.

### Task G.1 — Probe import — **DONE**

> **Run 2026-08-23; findings are section 6 of `oil-city-import-notes.md`.** Four
> things came out of it, three now fixed as separate commits:
>
> - **Fuel type — fixed.** 40 of 59 models stated no fuel and were being skipped
>   entirely, taking two thirds of the recommendations with them. Unstated now
>   means petrol (`DEFAULT_FUEL_TYPE`); explicit wording still wins, so "هیبرید"
>   models stay HYBRID. 59/59 engines afterwards.
> - **Zero prices — fixed.** 197 of 200 products state no price, and the importer
>   stores 0. `updateProduct` now refuses to activate a product priced at zero, so
>   D.4's bulk activate cannot put a free-looking row on the storefront.
> - **"تماس بگیرید" — fixed.** A price state, not a parse failure; 63 false
>   problems were burying real ones.
> - **Profile dedup — measured, premise abandoned.** No hashing variant produces
>   any sharing; the recommendations genuinely differ per car. Expect ~803
>   profiles, not "far fewer". See section 6.2 of the notes.

### Task G.1 — the prompt as run

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

### Task G.2 — Full import run — **DONE**

**DoD:** All oil-city batches imported for real; row counts recorded; every created row INACTIVE.

> **Run 2026-08-24.** Scrape: **3,469 products and 803 cars, zero failures and zero problems** across
> 35 batch files, after a purge-and-refetch cleared 15 pages that had cached non-answers (see the
> fetcher commit). Import: 3,469 products, 131 brands, 83 car brands, 802 car models, 802 engines,
> 802 profiles, **71,303 fitment items**.
>
> **Every fitment item resolved to a real product — none spec-only.** In the G.1 probe 1,743 of 1,769
> fell back to spec-only because the product sample did not overlap what the cars referenced. Running
> the whole catalog in one pass, products first, resolved all 71,303. That is the entire justification
> for the `01-`/`50-` filename convention, and it is now measured rather than assumed.
>
> **Idempotency confirmed.** The re-run immediately afterwards reports every row `unchanged` — zero
> created, zero updated, across 3,469 products and 71,303 items. This is the check G.1 structurally
> could not perform, because two dry runs both roll back.
>
> **Dedup: 1.0 engines per profile across all 85 brands.** The Toyota caveat is closed — Iranian
> domestic models do not share recommendations either. Section 6.2 of the notes stands: expect one
> profile per car.
>
> Database state after: 1,051 imported products at price 0 (the source stated none), 0 imported rows
> ACTIVE, and only the 16 hand-seeded inventory rows carrying stock.
>
> **Measured for Task F.4: only 302 of 802 model names (38%) carry a year, and 259 (32%) a full
> range** — "A6 2011-2015", "Q7 موتور 3000 مدل 2011-2015". So oil-city answers the year question for
> about a third of cars and F.4 is still needed for the rest. Its scope shrinks rather than vanishing:
> G.3 can parse the 38% for free and only fall back to hamrah-mechanic for the remainder.
> **Prompt:**

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

### Task G.3 — Year enrichment applier — **PART ONE DONE**

> **Built and run 2026-08-24, with the oil-city provider only.** `scripts/enrich-years.ts` reads the
> years a car states in its own name and applies them to importer-owned rows: **272 of 802 models
> updated**, 530 waiting on Task F.4. Re-running touches nothing.
>
> Both calendars appear in the same run and each derives from its own numbers — BMWs and Audis as
> `2010-2013 GREGORIAN`, and all six Peugeot 206 types as `1386-1401 JALALI` / `1381-1385 JALALI`.
> That is A.5's design working on real data rather than on a fixture.
>
> **Only a full RANGE is trusted, never a single year.** The source names engines by displacement:
> "اسکالا 2000" and "اسکالا 1600" are 2000cc and 1600cc cars, and a lone 2000 sits squarely inside the
> Gregorian year window. A single-number parse would have dated a Renault Scala to the year 2000. Both
> ends must also agree on a calendar, which rules out the "از 1404 تا 2024" shape F.4 will meet on
> hamrah-mechanic before it can ever be stored.
>
> The constraints the prompt below asks for are all in place — year fields only, `oil-city:` rows only,
> `--dry-run`, and never overwriting a span that is no longer the import's placeholder.
>
> **Second provider done 2026-08-24.** hamrah-mechanic now feeds the same update path, on an **exact
> name match and nothing looser**: **51 more models** got real spans, 23 were reported as ambiguous,
> and 479 keep the wide placeholder.
>
> The modest yield is the point, not a shortfall. The two sources slice the same cars differently —
> hamrah stops at "پژو 206 صندوقدار" while oil-city says "206 صندقدار اتوماتیک", one letter and one
> word apart — and matching those would have been guessing. A missing span is recoverable: the car
> keeps its placeholder and somebody sets it by hand. A wrong span is not, because it looks right; the
> customer picks their year, matches nothing, and is told their car is not supported, and nobody goes
> looking. Ambiguity is reported for the same reason rather than resolved by taking the first hit.
>
> **State after both providers: 323 of 802 models (40%) carry a real span, 479 keep the placeholder,
> 23 of the models are JALALI.** The unmatched and ambiguous lists print on every run, so they are a
> worklist for the admin rather than a silent pile of wrong years.

**Prompt (F.4's hamrah-mechanic provider — the remaining half):**

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

### Task G.4 — Review and activate — **RUNBOOK DONE, NOTHING ACTIVATED**

> **`docs/import-review-runbook.md`, written 2026-08-24.** The checklist, the order of work, the admin
> mechanics and the traps, written to be usable by someone who never read this task list.
>
> **Nothing was activated, deliberately.** Judging whether a given oil suits a given engine is a
> question about cars, not about code, and "the import said so" is not a reason to put a
> recommendation in front of a customer who will act on it. The runbook exists so that judgement is
> made once, in order, with the traps already known.
>
> Two things the review will run into, both measured rather than guessed:
>
> - **About 50 of the 65 priority Iranian models still carry the import's placeholder year span.**
>   Neither year provider could reach them: oil-city does not state their years, and hamrah-mechanic
>   names them without the engine and transmission ours carry — "پژو پارس" against
>   "پارس TU5 اتوماتیک". Setting those by hand is the single highest-value review task, and A.5's
>   calendar-aware form is already waiting for it.
> - **Bulk activate is 20 rows at a time**, which is ~86 pages for the 1,720 in-scope products. That
>   is deliberate rather than a limitation, but it should be expected rather than discovered.

**Prompt:**

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
