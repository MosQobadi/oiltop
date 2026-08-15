# Top Oil — Fitment: Variant Images & "I'm not sure" — Task List

Companion to `topoil-storefront-claude-code-tasks.md`. Covers steps 3 and 4 of the fitment
follow-up plan: giving each car variant its own photo, and letting a customer who doesn't know
their engine still get an answer.

Same discipline as the other task docs: **one task = one Claude Code session = one commit**, in
order. Read the Design Decisions first — they're what keep this from turning into a schema
rewrite.

**Scope boundary:** this doc adds **one nullable column** (Task A.2) and optionally **two more**
(Task B.5). Nothing else here is a schema change. `FitmentProfile`, `FitmentProfileItem` and
`CarEngineFitmentProfile` are untouched, and no existing row is migrated, converted or deleted.

---

## Design decisions (read before Phase A)

**1. `CarEngine` is a _variant_, not an engine — rename the UI, not the schema.** The row already
holds a free-text bilingual label, a year span, an engine code and a fuel type. That is exactly
"a version of this model that a customer picks", which in this market is a تیپ (Type/trim), not a
combustion engine. Every customer-facing string changes from "Engine" / "موتور" to
"Type" / "تیپ"; the model name, table name, route segments (`/admin/cars/.../engines`), service
function names and the `carEngineId` field name all stay as they are. Renaming identifiers would
be pure churn across ~40 files and would break the importer's `sourceRef` bookkeeping for no
functional gain.

**2. The variant image is additive, with a fallback to the model's image.** `CarEngine.image`
becomes a new nullable column. Resolution order is **variant image → model image → placeholder**.
This is what makes the change zero-risk for the data already in the admin panel: every existing
variant has `null` and keeps rendering exactly what it renders today. Photos get added only where
they actually differ (206 Type 2 vs Type 5, Tucson 2015 vs Tucson 2025).

**3. A facelift with no fitment change is still a separate variant row.** When a generation change
alters the photo but not the recommended parts, split the variant and attach the **same
`FitmentProfile` to both** via `CarEngineFitmentProfile`. Profiles are reusable by design, so the
second row costs a label, a year span and a photo — nothing is re-entered. Rejected alternative:
letting `CarModel` hold several images each tagged with a year range. That is a new concept, a new
table and a new admin screen to solve what one extra row already solves.

**4. "I'm not sure" is a resolution _mode_, not new data.** No column, no table, no flag. When the
customer declines to pick a variant, resolve **every** candidate variant for that model+year and
compare the results. Nothing is stored; it is a different way of reading data that already exists.

**5. Agreement is computed on _resolved output_, per category and climate — never on profile
identity.** Two variants can have two different `FitmentProfile` rows that happen to recommend the
same products; comparing profile ids would report a difference that isn't one, and the customer
would be asked a question that doesn't matter. Compare, per `(categoryId, climate)` pair, the
**sorted set of resolved product ids plus the spec note and spec attributes**. Identical across
all candidates → agreed. Anything else, including one candidate having no item for that category
at all → differs.

**6. The `fit` URL param gets a second shape — understood by the fitment page only.** Today
`?fit=<carEngineId>` (`FIT_PARAM` in `lib/storefront/fitment.ts:11`) is the only form. An
unresolved car has no engine id to carry, so add a second, prefixed shape —
`?fit=my:<carModelId>:<year>` — distinguishable from a cuid by the colons, which cuids never
contain. Existing bookmarks and shared links stay valid.

**The PDP, PLP and category pages need no changes at all.** All three pass the raw value to
`getActiveCarEngineContext()` (`app/[locale]/products/[slug]/page.tsx:64`,
`app/[locale]/products/page.tsx:80`, `app/[locale]/categories/[slug]/page.tsx:68`), which is a
plain `findFirst` on an id and returns `null` for any string it doesn't recognise. A `my:` value
therefore already degrades to "no banner, no fit verdict" without a crash or a 404.

That is also the correct behavior, not merely the cheap one: "Fits your car" is a claim that
cannot honestly be made when the type is unknown, and a banner reading "Peugeot 207i 2023 (type
not selected)" on every product page is noise carrying no verdict. **An unresolved car is a state
of the fitment page, not a context that travels.** Picking a specific variant is what promotes it
into a travelling `?fit=<carEngineId>` again.

Rejected: separate `?fitModel=&fitYear=` params. Two params means every consumer has to know both,
and `withFitContext()` stops being the single place a car is written into a URL.

**7. Cards in `full` mode, select in `compact`.** The homepage widget (`mode="compact"`) is a
2-column grid of selects in a small card; image cards do not fit there and the hero is not where a
customer studies photographs. The variant step becomes a visual card list in `mode="full"` only —
the fitment page and the car model pages. Compact keeps the existing `SelectMenu`, with the label
rename from Decision 1 applied.

---

## Phase A — Variant identity and images

### Task A.1 — Rename the Engine step to "Type"

**Prompt:**

```
Rename the customer-facing "Engine" step to "Type" / "تیپ" across the storefront. Touch display
strings only — do not rename models, columns, route segments, service functions, props or the
carEngineId field.

Files: components/storefront/fitment/FitmentWizard.tsx (the `engine` StepView's label,
placeholder and emptyMessage), plus any other pickLocale() string that says "Engine"/"موتور" to a
customer — grep the storefront for both. In lib/storefront/fitment.ts, formatEngineOptionLabel
keeps its name but should read as "<label> (<years>)" as it does now.

In the admin panel (English/LTR per CLAUDE.md), change the page headings and the form's "Label"
field caption on
app/(admin)/admin/cars/brands/[carBrandId]/models/[carModelId]/engines/[carEngineId]/page.tsx and
its list page from "Car Engine" to "Car Type / Version", and change the label placeholder from
"2.5L I4 Petrol" to something that shows the intended convention, e.g. "Type 2 (TU3 1.4L)". Leave
the breadcrumb URLs alone.

Add a short note to CLAUDE.md's Cars & Fitment section stating the admin rule: create a new
variant row whenever the recommended products differ — whether the reason is a different trim, a
different engine, or a different year period — and keep year spans within a model contiguous.
```

**DoD:** No customer-facing string says "Engine"/"موتور" as the name of the step. No identifier,
route, column or function was renamed. `pnpm lint` and `pnpm tsc --noEmit` clean. Existing e2e
fitment spec still passes (update selectors only if they matched on visible text).

---

### Task A.2 — `CarEngine.image` and its admin upload

**Prompt:**

```
Add an optional image to the car variant.

Schema: add `image String?` to CarEngine in prisma/schema.prisma (model at line ~414), alongside a
migration. Run `pnpm prisma generate` and confirm the migration applies. Restart the dev server
afterwards — a stale client returns bare 500s on routes using the new field.

Validation: add `image: z.string().min(1).optional()` to carEngineShape in
lib/validation/carEngine.ts, matching how carModel.ts already types its image.

Admin form: add an ImageUploadField to the car variant form page, placed directly under the
Label field. Wire it through load (reset) and submit (payload) the same way engineCode is wired.
Caption it so the intent is clear: "Optional — falls back to the model's photo when empty."

Service: add `image: true` to the carEngineSelect in lib/services/fitment.ts so CarEngineOption
carries it, and make sure the model image is already selected on CarModelOption (it is).

Add a helper in lib/storefront/fitment.ts — `variantImage(engine, model)` — returning
engine.image ?? model.image ?? null. Every surface uses this; nothing reads engine.image
directly.
```

**DoD:** Every pre-existing `CarEngine` row has `image = null` and renders exactly as before.
Uploading a photo on one variant does not affect its siblings. `pnpm prisma generate` run,
migration applies cleanly, `pnpm lint` and `pnpm tsc --noEmit` clean.

---

### Task A.3 — The variant step becomes a visual card list

**Prompt:**

```
In mode="full" only (per Design Decision 7), replace the variant step's SelectMenu in
components/storefront/fitment/FitmentWizard.tsx with a card list. mode="compact" keeps the select.

Each card shows: the variant photo via variantImage() from Task A.2 (next/image, never raw img,
with a neutral placeholder when both are null), the bilingual label, the year span from
formatYearSpan(), and the engine code as a small monospace chip when present.

Build it as a radiogroup: an accessible fieldset with a legend carrying the step label, one radio
per variant, keyboard-navigable, visible focus ring, selected state readable without relying on
color alone. Reuse the accent token (#c2410c) for the selected border — no new colors.

Behavior is unchanged: selecting a card calls wizard.selectEngine, which still resolves and
navigates. The one-variant auto-skip in useFitmentWizard.ts:226 stays exactly as it is — a
single match still never renders this step at all.

Layout: single column on mobile, two columns from sm up. The card is the click target, not just
the radio.
```

**DoD:** The full-mode wizard shows photographed cards; the compact homepage widget is visually
unchanged apart from the Task A.1 label. Keyboard-only selection works end to end. Auto-skip still
fires for single-variant years. Responsive at 375/768/1280 and correct in RTL.

---

## Phase B — "I'm not sure which type I have"

### Task B.1 — Multi-variant resolution and agreement grouping

**Prompt:**

```
Service layer only, no UI. In lib/services/fitment.ts add:

  resolveFitmentForModelYear(carModelId, year, audience): Promise<AmbiguousFitment>

It calls the existing getEnginesForModelYear() for the candidates, resolves each one through the
existing resolveFitmentGroups() path (do not duplicate the resolution query), then merges per
Design Decision 5:

  - Key every resolved item by (categoryId, climate).
  - For each key, build a comparison fingerprint from the sorted resolved product ids plus
    specNote and a stable stringification of specAttributes.
  - A key whose fingerprint is identical across ALL candidate variants is `agreed` — emit it once,
    exactly as a normal FitmentCategoryGroup so the existing FitmentResults rendering can take it
    unchanged.
  - Any other key is `differs` — emit it grouped by category, then by variant, each carrying the
    variant's label parts so the UI can name which type it belongs to. A variant with no item for
    that category is represented explicitly as "no recommendation", not omitted.

Return { candidates, agreed, differs }. Sort `agreed` and `differs` with the existing
sortFitmentGroups ordering. Respect the FitmentAudience distinction exactly as
resolveFitmentForEngine does.

Unit-test in lib/services/fitment.test.ts: all variants agree on everything; all differ; a mix
where oil differs but every filter agrees (the realistic case); one variant missing a category
entirely; a single candidate (must behave identically to resolveFitmentForEngine); zero candidates.
```

**DoD:** Pure service function with tests covering the six cases above. No schema change. No
duplicated resolution query — it composes the existing helpers. `resolveFitmentForEngine` is
untouched and its tests still pass.

---

### Task B.2 — A second shape for the `fit` param

**Prompt:**

```
Per Design Decision 6, teach the fit context two shapes without breaking the first.

In lib/storefront/fitment.ts:
  - Keep FIT_PARAM and withFitContext(href, carEngineId) working as they do.
  - Add withModelYearFitContext(href, carModelId, year) writing `fit=my:<carModelId>:<year>`.
  - Add a pure parser: parseFitParam(raw) → { kind: "engine", carEngineId } |
    { kind: "modelYear", carModelId, year } | null. The `my:` prefix and the colon count are what
    distinguish the shapes; a cuid never contains a colon. Validate the year is a plausible
    integer.

In lib/services/fitment.ts add getActiveCarModelYearContext(carModelId, year) returning the model,
its brand, the year and the candidate variants — null when nothing active matches, so a stale link
degrades to "pick your car again" rather than a 404.

Update ONE consumer: app/[locale]/fitment/page.tsx, which currently safeParses the raw value as an
id (line ~45) and calls getActiveCarEngineContext. It now branches on parseFitParam instead.

Do NOT touch the PDP, PLP, category pages or FitContextBanner. Per Design Decision 6 they already
degrade correctly — getActiveCarEngineContext returns null for a `my:` string — and an unresolved
car deliberately does not travel to those surfaces. Verify this rather than assuming it: load a
PDP and a PLP with a `my:` fit value and confirm each renders normally with no banner and no
console error.

Unit-test parseFitParam against: a bare cuid, a valid my: string, a my: string with a junk year,
an empty string, and a cuid-shaped string with a colon injected.
```

**DoD:** Old `?fit=<cuid>` links still resolve identically — verify with an existing e2e link. A
`my:` value renders the unresolved fitment page, and renders PDP/PLP/category pages cleanly with
no car context and no errors. `git diff` touches `lib/storefront/fitment.ts`,
`lib/services/fitment.ts`, `app/[locale]/fitment/page.tsx` and their tests — nothing else.

---

### Task B.3 — The "I'm not sure" option in the wizard

**Prompt:**

```
Add an explicit "I'm not sure which type" / "مطمئن نیستم کدام تیپ است" choice to the variant step,
rendered as the last card in full mode and as the last option in compact mode.

In useFitmentWizard.ts add selectUnknownEngine(), which resolves the wizard with a model+year
context instead of an engine id. That means the hook's onResolve callback can no longer be typed
as (carEngineId: string) => void — widen it to take a resolved-car union, and update
FitmentWizard's handleResolve to route to withFitContext or withModelYearFitContext accordingly.
Check every other caller of the hook and of FitmentWizard's onResolve prop (the car model pages
pass one) and update them.

The option must not appear when the step is auto-skipped — one candidate means there is nothing
to be unsure about.

Where Task B.5's hint fields exist, show the hint under each variant's label so a customer can try
to identify their type before falling back to "not sure".
```

**DoD:** Choosing "I'm not sure" lands on the fitment page with a `my:` fit param. Choosing a
variant behaves exactly as before. The option is absent for single-variant years. Works in both
wizard modes and from the car model pages.

---

### Task B.4 — The unresolved results view

**Prompt:**

```
Teach app/[locale]/fitment/page.tsx its third state: a model+year fit context (Task B.2) renders
resolveFitmentForModelYear (Task B.1) instead of resolveFitmentForEngine.

Layout, in this order:

1. Header naming the car as far as it is known — "Peugeot 207i 2023" — with a line saying the type
   wasn't specified and that most parts are the same either way.
2. The `agreed` groups first, rendered through the existing FitmentResults component with no
   changes to it. These are the confident answers; they must not be visually hedged.
3. The `differs` groups below, under a heading that frames the remaining question plainly
   ("These depend on your type" / "این موارد به تیپ خودرو بستگی دارد"). Within each category, one
   labelled column or block per variant, showing the variant's name, its engine code and its photo
   from Task A.2 — the photo is often how a customer recognises their own car.
4. A "narrow it down" affordance listing the candidate variants, so a customer who works out which
   one they have can commit to it and get the clean single-variant results page.
5. The existing "Request it" fitment-inquiry path, reachable from this state too — a customer who
   still can't tell is a lead, not a dead end. Pre-fill the message with the model+year and the
   fact that the type is unknown.

If `differs` is empty, say so and render as a normal resolved results page — the ambiguity turned
out not to matter.
```

**DoD:** A model+year URL renders agreed parts confidently and differing parts side by side with
variant names and photos. The all-agree case reads like a normal result. The inquiry form creates
a real `FitmentInquiry`. Existing single-engine results are byte-for-byte unchanged. Responsive
and correct in RTL.

---

### Task B.5 — Identification hints

**Prompt:**

```
Add `identifyHintEn String?` and `identifyHintFa String?` to CarEngine, with a migration and
`pnpm prisma generate`. Add them to lib/validation/carEngine.ts and to the admin variant form as a
BilingualTextareaField captioned "How a customer can tell this is their type — where the engine
code is stamped, what the badge says." Render the hint under the variant's label in the wizard's
card list and in Task B.4's "narrow it down" list.
```

**DoD:** Optional on every existing row; blank hints render nothing at all, no empty labels or
dashes.

**Promoted from optional.** At roughly 50 ambiguous models the content cost is about a day of
writing, which is affordable — and every customer a hint helps identify correctly is one who never
reaches the "not sure" path. Build it right after A.3 so the hint has a card to live on, and write
the 50 hints while Phase B's code is being built.

---

### Task B.6 — E2E coverage

**Prompt:**

```
Extend e2e/fitment.spec.ts. Remember global-setup needs SEED_RESET=1 and that a running dev
server blocks Playwright from starting its own.

Cases:
  - A model+year with one variant still auto-skips (existing behavior, guard against regression).
  - A model+year with three variants shows the card list with photos.
  - "I'm not sure" → agreed parts render, differing parts render grouped by variant.
  - Narrowing down from the unresolved view to one variant reaches the normal results page.
  - An old-style ?fit=<carEngineId> URL still resolves.
  - Submitting the inquiry from the unresolved view creates a FitmentInquiry.

Seed whatever fixture this needs additively — do not modify the existing Hyundai Tucson reference
profile, it is the known-good shape the import work checks against.
```

**DoD:** All six pass. `pnpm lint`, `pnpm tsc --noEmit`, `pnpm build` clean.

---

## Effort summary

| Task                                       | Size         | Estimate    |
| ------------------------------------------ | ------------ | ----------- |
| A.1 — Rename step to "Type"                | small        | < 1 session |
| A.2 — `CarEngine.image` + admin upload     | small        | ~½ session  |
| A.3 — Variant step as visual cards         | medium       | 1 session   |
| B.5 — Identification hints                 | small        | ~½ session  |
| B.1 — Multi-variant resolution + agreement | medium       | 1 session   |
| B.2 — Second `fit` param shape             | small        | ~½ session  |
| B.3 — "I'm not sure" in the wizard         | small–medium | ~½ session  |
| B.4 — Unresolved results view              | medium       | ~1 session  |
| B.6 — E2E                                  | small–medium | ~½ session  |

**Development total: roughly 5 sessions.**

The larger cost is not here. Reviewing the cars already entered, splitting or merging variants,
fixing year spans and uploading photos is content work measured in weeks for a few hundred models,
and no amount of code shortens it.

---

## Sizing: about 50 ambiguous models

The project owner's estimate is a maximum of ~50 models where one model+year resolves to more than
one variant. Two consequences, and they point in opposite directions.

**It does not make Phase B less important.** Row count is the wrong metric — session share is the
right one. The cars with several types per year are exactly the high-volume domestic ones (206,
207i, Pars, Samand, Dena, 405, Tiba, Pride and their siblings), so 50 models out of several hundred
could still be most of the traffic that reaches the car finder. Confirm which 50 they are before
concluding anything; if they are the popular cars, Phase B is the higher-value half of this doc,
not the optional half.

**It does make Phase B cheaper to build.** Two cuts, both already folded into the tasks above:
B.2 shrinks to the fitment page alone (Design Decision 6), and B.5 becomes affordable content work
rather than an open-ended one, so it is promoted out of "optional".

**And 50 is few enough to just read.** Before starting B.4, enumerate them by hand and record, for
each, which categories actually differ between its variants. If the answer is almost always "only
the engine oil", B.4's layout is one differing category and stays simple. If several models differ
across three or four categories, the differing section needs a denser layout and B.4 grows. This
is an hour of looking that de-risks the largest remaining task.

---

## Order and dependencies

A.1 → A.2 → A.3 → B.5, then B.1 → B.2 → B.3 → B.4, then B.6.

A.3, B.4 and B.5 all render the variant card, so **A.3 defines that card component and the others
reuse it** — don't let B.4 invent a second one.

B.1 is the piece not to cut. It is what prevents a wrong purchase: for a Pars, the filters are
likely identical across EF7/TU5/XU7 and only the oil differs, so the customer gets four of five
categories with certainty. Without it the only options are forcing a guess (wrong oil sold) or
showing nothing (sale lost). It is also the cheapest task to verify, being pure service logic with
no UI.

---

## What this deliberately does not change

- **Existing admin data.** One nullable column in A.2, two more in optional B.5. No conversion, no
  backfill, no deletion.
- **The fitment model.** `FitmentProfile`, `FitmentProfileItem` and `CarEngineFitmentProfile` are
  untouched, including profile reuse across variants — which is what makes Decision 3 cheap.
- **The oil-city.ir importer.** It depends on a variant being a flexible free-text row with a wide
  year span (`IMPORTED_YEAR_START = 2000`, `yearEnd` null) because the source has no engines and no
  years. Every decision here preserves that. Imported variants simply have `image = null` and fall
  back to the model photo, and a model+year that resolves to one imported variant auto-skips
  exactly as it does today.
