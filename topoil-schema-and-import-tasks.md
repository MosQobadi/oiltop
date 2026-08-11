# Top Oil — Schema Hardening & Catalog Import — Claude Code Task List

Companion to `topoil-admin-claude-code-tasks.md`, `topoil-storefront-claude-code-tasks.md` and
`oil-city-import-notes.md`. Everything here came out of one question: the catalog is about to go from
17 products and 9 car engines to roughly 4,000 products, 20 categories and 800 car models, most of it
imported rather than typed. This list is what should change before that happens.

## How to use this

- Same discipline as the other two docs: one task = one Claude Code session = one commit, in order.
- **Phases A and D are the ones with a deadline.** Every task in Phase A is cheaper now than after
  4,000 rows exist, and Phase D can't start until A.2 lands. Phase E is explicitly "not yet".
- Any schema change: edit `prisma/schema.prisma` and write the migration in the same task, then run
  `pnpm prisma generate` and confirm the migration applies. Never leave the two out of step.
- `prisma/seed.ts` refuses to run against a populated database (`SEED_RESET=1` overrides). Do not
  disable that guard to make a task easier — a seed run destroyed hand-entered data once already.

---

## Decisions this list assumes

**1. Imported cars get a wide, honest year span.** oil-city.ir publishes no years, and
`CarEngine.yearStart` is required. Synthesised engines get a broad range rather than an invented
precise one — a wrong year range is worse than a vague one, because customers act on it.

**2. Categories the source recommends but we don't carry get created, not dropped** — coolant, brake
fluid, ATF, additives — imported as `partType: OTHER` with `status: INACTIVE`, so the data is
captured without shipping a half-built category to the storefront.

**3. Phase B is a genuine fork in the road.** Read its rationale before starting it. If the answer is
"we want to keep hand-picking products per car", skip Phase B entirely — nothing else depends on it.

---

## Phase A — Schema hardening (do before importing anything)

### Task A.1 — Index every foreign key

**DoD:** A migration adds indexes on all FK columns listed below; `pnpm prisma migrate` applies
cleanly; no application code changes.
**Prompt:**

```
Prisma does not create indexes on foreign key columns for PostgreSQL, and this schema has none —
the only indexes that exist are the unique constraints plus @@index on ProductPriceLog and
StockNotification. Add @@index declarations and the matching migration for:

  Product.categoryId, Product.brandId
  Inventory.productId is already unique — skip it
  FitmentProfileItem.profileId, FitmentProfileItem.categoryId, FitmentProfileItem.productId
  CarEngineFitmentProfile.profileId  (carEngineId is covered by the composite unique)
  CarModel.carBrandId
  CarEngine.carModelId
  OrderItem.orderId, OrderItem.productId
  FitmentInquiry.carEngineId, FitmentInquiry.categoryId

These back the PLP's category/brand filter, resolveFitmentForEngine, and getFittingCarEngines
(the PDP's "fits your car" reverse walk, which currently has no index support at all).

Schema + migration in the same commit, then pnpm prisma generate. No behaviour changes, so the
existing test suite passing is the check.
```

### Task A.2 — `sourceRef` on every importable model

**DoD:** `Product`, `Brand`, `CarBrand`, `CarModel` each carry a nullable unique `sourceRef`; nothing
in the app writes it yet; existing rows are unaffected.
**Prompt:**

```
Nothing in the schema records where an imported row came from, so a second import run can't tell
"already imported" from "new" and would duplicate everything.

Add `sourceRef String? @unique` to Product, Brand, CarBrand and CarModel, with the migration. The
convention for its value is "<source>:<natural key from that source>", e.g.
"oil-city:product/toyota-5w30-4l" — document that in a comment on the Product field and reference
it from the others rather than repeating it four times.

Nullable because everything entered through the admin panel has no source. Unique because it is the
importer's idempotency key. Do not expose it in any admin form or API response — it is plumbing.
```

### Task A.3 — Structured spec columns on Product

**DoD:** `Product` carries `viscosity`, `apiGrade`, `volumeMl`, `specs`; the admin product form edits
the first three; the PDP renders whichever are set; Zod validates them.
**Prompt:**

```
Product specs currently live in free-text descriptions and the untyped `tags` array, which means the
one dimension customers actually filter oil by — viscosity — is unqueryable.

Add to Product (schema + migration):
  viscosity String?   // "5W-30", stored uppercase-normalised
  apiGrade  String?   // "SN"
  volumeMl  Int?      // 4000
  specs     Json?     // anything else, same role as FitmentProfileItem.specAttributes

Then:
- lib/validation: add these to the product create/update schemas. viscosity matches a permissive
  pattern (digit(s) + W + digit(s), or a plain grade), volumeMl is a positive int. All optional.
- app/(admin)/admin/products/[...id]: add the three fields to the form using the shared TextField
  primitives, grouped under a "Specifications" section. `specs` is not editable in the UI yet.
- The PDP renders a small spec list from whichever of the three are set. Nothing renders when all
  are null — no empty "Specifications" heading.

Do not backfill existing products in this task; the importer (D.2) and manual editing fill them.
```

### Task A.4 — `variantGroup` for same-product-different-size

**DoD:** `Product.variantGroup` exists and is indexed; the PDP lists sibling sizes when siblings
exist; nothing else changes.
**Prompt:**

```
The same oil sold in 1L / 4L / 5L is three Products today, which will make a 4,000-product catalog
read as mostly duplicates and leaves the PDP unable to say "also available in 1 litre".

Add `variantGroup String?` to Product with an @@index, plus migration. Same value across sizes of
one product; null means "no siblings". Deliberately a plain string, not a parent/child relation or a
new table — the only question it has to answer is "which other products are this one in a different
size".

On the PDP: when a product has a non-null variantGroup, query its ACTIVE siblings (same
variantGroup, different id) and render them as a compact size selector linking to each sibling's
PDP, ordered by volumeMl ascending. Use A.3's volumeMl for the label, falling back to the product
name when volumeMl is null. Nothing renders when there are no siblings.
```

---

## Phase B — Spec-based fitment (the fork — read first)

**Rationale.** A `FitmentProfileItem` currently points at a _specific product_, so "Tucson takes
5W-30" is stored as "Tucson takes Shell Helix Ultra 5W-30 4L". At 800 imported cars that's ~4,000
hand-maintained links; stop stocking that Shell oil and hundreds of cars silently lose their
recommendation. The underlying fact — _this engine needs 5W-30, API SN or better_ — is exactly what
the source site publishes, and after A.3 it's also queryable against the catalog.

This phase makes a fitment item able to express a **spec** that resolves to whatever is in stock,
while keeping explicit product links as an override. Skip the whole phase if you'd rather keep
curating by hand — nothing outside it depends on it.

### Task B.1 — `matchSpec` on FitmentProfileItem + resolver

**DoD:** An item with `matchSpec` and no `productId` resolves to live matching products;
`resolveFitmentForEngine` returns them in the same shape as explicitly-linked ones; an item with both
prefers the explicit product.
**Prompt:**

```
Add `matchSpec Json?` to FitmentProfileItem (schema + migration), documented shape:
  { viscosity?: string, apiGrade?: string, volumeMl?: number }
Keep specAttributes as-is — that is display text for the spec-only card, this is a query.

In lib/services/fitment.ts, extend resolution so an item resolves in this precedence:
1. productId set                  -> that product (current behaviour, unchanged)
2. matchSpec set, productId null  -> ACTIVE products in the item's category matching every key
                                     present in matchSpec, ordered by finalPrice ascending, capped
                                     at a documented limit (start with 4)
3. neither                        -> the existing spec-only fallback, unchanged

A matchSpec that resolves to zero products falls back to the spec-only card rather than rendering an
empty category — the customer still gets an answer and a lead is still capturable.

FitmentResolvedItem currently holds one nullable product. Widen it to a product list rather than
adding a second parallel field, and update FitmentResults + the admin preview to map over it. The
existing single-product case becomes a list of one; the storefront's co-equal grid already renders
several cards per category, so the UI change should be small.
```

### Task B.2 — Admin: author a spec-matched item

**DoD:** The fitment profile item modal can create a spec-matched item, shows a live count of what it
currently matches, and blocks a matchSpec on a category whose partType isn't ENGINE_OIL.
**Prompt:**

```
In app/(admin)/admin/cars/fitment-profiles/ItemFormModal.tsx, add a third item mode alongside
"specific product" and "spec-only note": "match by spec".

- Fields: viscosity, apiGrade, volumeMl — the same three A.3 put on Product, reusing the shared form
  primitives.
- Show how many ACTIVE products currently match, refreshed as the fields change, with the first few
  named. An admin must be able to see that "5W-30 / SN" means something before saving.
- Zod cross-field rule in lib/validation/fitmentProfile.ts: matchSpec is only valid on a category
  whose partType is ENGINE_OIL, same shape as the existing climate rule. Server-side too.
- The count endpoint is a thin admin route calling into server/, not a Prisma call in the handler.
```

---

## Phase C — Category model cleanup

### Task C.1 — Retire `filterKind`, narrow `partType`'s job

**DoD:** `filterKind` is gone from schema, validation, admin UI and PLP filters; everything that used
it filters by category instead; `partType` survives only where behaviour actually branches on it.
**Prompt:**

```
Category.filterKind is 1:1 with category today — oil-filter <-> OIL_FILTER, four for four — so it is
a second source of truth for the same fact, and the one that can drift. partType, meanwhile, has
four values and is about to face 20 categories, fifteen of which would be OTHER.

Audit every use of both first and put the list in the commit message. Expected: the climate
cross-field rule, fitment group ordering (sortFitmentGroups), PLP filter grouping, the category
admin form, and the public categories route.

Then:
- Remove filterKind entirely (schema + migration + validation + admin form + PLP filter). Anything
  that filtered by filterKind filters by category slug — the PLP already supports ?category=.
- Keep partType, but only for the two things that genuinely branch on behaviour: the ENGINE_OIL
  climate rule, and fitment group ordering. Document on the enum that it describes how a category
  behaves, not what it contains, so nobody adds a value per new category.

This is a breaking change to the public /api/storefront/categories payload and the PLP query string.
Grep for filterKind across app/, components/ and e2e/ before declaring done.
```

---

## Phase D — Import pipeline

Depends on A.2. Read `oil-city-import-notes.md` first — it has the source survey, the extraction
prompt, and the four structural mismatches this phase has to absorb.

### Task D.1 — Scrape file format + validation

**DoD:** `lib/validation/import.ts` parses a batch file with Zod and rejects a malformed one with a
readable per-record error; a fixture batch round-trips in tests.
**Prompt:**

```
Define the scrape batch format as a Zod schema in lib/validation/import.ts, matching the JSON shape
documented in section 4 of oil-city-import-notes.md (products[], cars[] with sections[], problems[],
_meta). Files live in scrape/<source>/*.json, gitignored except a small committed fixture.

Every field is nullable except the natural keys (sourceSlug, brandNameFa, modelNameFa) and
sourceUrl. Validation failures must name the file, the record index and the field — a 3,000-record
batch failing with one line of context is useless.

Add a fixture batch under a test fixtures dir with a handful of real records (a discounted oil, a
filter with no specs, one car with several sections) and a test that parses it.
```

### Task D.2 — Importer with `--dry-run`

**DoD:** `pnpm tsx scripts/import.ts --source oil-city --dry-run` reports every create/update/skip
without writing; without the flag it applies them; running it twice changes nothing the second time.
**Prompt:**

```
Write scripts/import.ts. It reads every batch file for a source, validates with D.1's schema, and
upserts in dependency order: Brand -> Product (+Inventory) -> CarBrand -> CarModel -> CarEngine.

Rules:
- Idempotency key is sourceRef ("oil-city:<sourceSlug>"). An existing row with that sourceRef is
  updated; a row without one is never touched — the importer must not overwrite hand-entered data.
- Slugs: lib/slug.ts strips everything outside [a-z0-9], so slugify() on a Persian name returns "".
  Derive the slug from the source URL slug when it is Latin, otherwise a stable fallback built from
  the sourceRef. Decide the rule once in one function, not per record.
- nameEn falls back to nameFa. The four description fields fall back to "". volumeMl/viscosity/
  apiGrade parse out of the source's specs object where present, null otherwise.
- priceToman is the price; originalPriceToman when present gives discountPercent, rounded.
- categoryGuess null -> the product is imported with the category named in decision 2 above, INACTIVE
  and reported in the summary. Never guess a category.
- Synthesised CarEngine per model per decision 1: one engine, labelFa from modelDescriptorText when
  present, fuelType parsed from the source's own wording with an explicit mapping table (unmapped ->
  reported, not defaulted).
- --dry-run prints a create/update/skip count per model plus every problem, and writes nothing.
- Ends with a summary: counts, unmapped categories, unmapped fuel types, brand-label disagreements.

Wrap the writes in a transaction per batch file so a mid-file failure doesn't half-import it.
```

### Task D.3 — Fitment profile dedup

**DoD:** Importing 800 car models produces far fewer profiles than models; two cars with identical
recommendations share one profile; re-running changes nothing.
**Prompt:**

```
Extend scripts/import.ts to build fitment from each car's sections[].

For each car, normalise its sections into a canonical item list (category, then either a resolved
productId or a spec, then order), hash it, and use that hash as the profile's identity: create one
FitmentProfile per distinct hash and link every engine sharing it via CarEngineFitmentProfile. This
is the whole point of the exercise — 800 model pages should collapse to a much smaller number of
profiles, and it is what makes the data maintainable afterwards.

Store the hash in FitmentProfile.internalNote (prefixed, e.g. "import-hash:<hash>") rather than
adding a column, and set label to something an admin can read — brand + model + the section count.

Products are matched by sourceRef from the section's productSourceUrl. A section product that is not
in the catalog does not block the profile: emit the item as spec-only using the section's specNoteFa
and report it.

Report at the end: profiles created, engines linked, average engines per profile, and the ten
largest profiles by engine count — that last number is how you tell the dedup actually worked.
```

### Task D.4 — Review queue for imported rows

**DoD:** An admin can list everything the last import created or touched, and activate it in bulk
after review.
**Prompt:**

```
Imported products and categories land INACTIVE, which means someone has to review them. Right now
there is no way to see "what did the import just add".

Add a filter to the admin Products and Categories lists for rows with a sourceRef, plus a bulk
activate action on the selected rows. Reuse the shared DataTable — this is a filter and a bulk
action, not a new screen. The filter is a simple "Source: any / imported / manual" select.

No new API surface beyond what the existing list and update routes need.
```

---

## Phase E — Not yet (revisit when it hurts)

### Task E.1 — Stored `finalPrice` for sortable, indexable pricing

**Trigger:** the PLP's price sort feels slow, or the catalog passes ~5,000 products.
**DoD:** Price sorting is done by the database; `findProductIdsSortedByFinalPrice` is deleted.
**Prompt:**

```
lib/services/catalog.ts sorts by final price in Node because finalPrice is computed, not stored: it
pulls every matching row's id/price/discountPercent into memory, sorts, then re-queries the page.
Its own comment says this is the function to replace rather than the callers.

Replace it with a PostgreSQL generated column — price * (1 - discountPercent / 100.0), STORED — plus
an index, added via a raw SQL migration since Prisma cannot express generated columns. Map it into
the schema as a read-only field, order by it directly, and delete
findProductIdsSortedByFinalPrice along with the two-query path in listStorefrontProducts.

Keep the read-time computation in toPublicProduct as-is so nothing downstream changes shape.
```

### Task E.2 — A `CarGeneration` level

**Trigger:** the first model where two generations need different parts and engine labels are
carrying generation information ("Tucson TL 2.0"), or year ranges are being repeated across every
engine of a facelift.
**Why it isn't now:** three levels is right for this catalog today, and the migration is
straightforward later. Adding it early buys nothing and costs a level of nesting in the wizard, the
admin tree and every fitment query.
