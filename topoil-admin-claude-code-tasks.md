# Top Oil — Admin Panel — Claude Code Task List

Reference wireframe: `top-oil.excalidraw` — this is Technotopia's own 27-frame wireframe (15 admin
frames + 12 storefront frames), reused as-is; it was not redrawn for Top Oil. The 15 admin frames
(Login, Dashboard, Products List/Form, Categories List/Form, Brands List/Form, Orders List/Details,
Inventory List/Modal, Customers List/Details, Settings) apply directly — just rebrand copy/colors
and, for Categories/Brands/Products forms, add the bilingual/SEO/partType fields described in Phase
1's Design Decisions. A separate companion file, `topoil-admin-new-frames.excalidraw`, has two frames
(Car Brands - List, Car Brand - Add / Edit) built fresh in the same visual style, covering Task 8.1.
No wireframe exists yet for the rest of Cars & Fitment (Car Models, Car Engines, Fitment Profiles,
Fitment Preview) or for Fitment Inquiries — these are new, and every task below describes the screen
fully in text (fields, columns, layout), so none of this blocks starting Claude Code sessions.

**Stack:** Next.js 16 · TypeScript · React 19 · HeroUI · Tailwind CSS · PostgreSQL · Prisma · Zustand
· React Hook Form · Zod · JWT + bcryptjs + HTTP-only cookies · Route Handlers (REST) · date-fns ·
pnpm · Docker + Docker Compose + Nginx · Ubuntu VPS

(Same stack as Technotopia. No i18n library in the admin panel itself — see Design Decisions below.)

## How to use this

- Each task = one Claude Code session = one commit/PR. Don't chain tasks in one prompt.
- Do them **in order**. Later tasks assume earlier ones exist.
- Before Task 0.1, create an `AGENTS.md` in the repo root — every subsequent session should start
  with Claude Code reading it.
- Where a task says "Prompt for Claude Code," that's meant to be pasted close to verbatim.
- This document covers the **Admin Panel only**, per your instruction to build that first. The
  customer-facing storefront (car-finder wizard, PDPs, cart/checkout, EN/FA locale routing, RTL
  layout, sitemaps/hreflang/JSON-LD) is a separate task list once the admin panel and data are in
  place — the schema below is designed so that storefront can be built without reshaping data.

---

## Design decisions (read this before Phase 1)

A few calls were made designing the data structure. Flagging them so you can override any of them
before Task 1.1 is run.

**1. Bilingual content, English-only admin UI.** Every user-facing text field (names, descriptions,
SEO meta) is stored as a pair — `xEn` / `xFa` — rather than a generic translation table. The admin
panel itself stays English/LTR (per your choice); each bilingual field renders as two side-by-side
inputs (English + Persian, the Persian one `dir="rtl"`) via one shared `BilingualTextField` /
`BilingualTextareaField` component built once in Phase 3 and reused everywhere. This is simpler to
build and query than a generic i18n table, at the cost of a fixed set of two languages — acceptable
since you only need EN/FA.

**2. Slugs are single, not per-locale.** `slug` is one ASCII/Latin field shared across both locales
(e.g. `mobil1-5w30`, `toyota-camry`), not `slugEn`/`slugFa`. Locale is expressed later by a URL
prefix in the storefront (`/en/products/mobil1-5w30`, `/fa/products/mobil1-5w30`), not by the slug
itself. This avoids Persian-character URL encoding issues and keeps one canonical path per entity
for SEO (with `hreflang` linking the two locale URLs — a storefront task, not admin).

**3. Fitment hierarchy: Car Brand → Car Model → Car Engine, with year as a range on Engine.** You
asked for Brand → Model → Year → Engine as the *lookup* flow, which is exactly what the future
storefront wizard does — but modeling "Year" as its own database row (one row per model per year)
would mean re-entering identical engine data 10-15 times for cars whose engine didn't change across
years. Instead, `CarEngine` carries `yearStart`/`yearEnd`, and the storefront wizard's "Year" dropdown
is computed by expanding the year ranges of all engines under the selected model. Net effect for the
end user: still four taps (Brand → Model → Year → Engine, with Engine skipped automatically when a
year only has one). Net effect for your admin data entry: one row per distinct engine, not per year.

**4. Filters are matched by an enum, not by category name.** Because category names are bilingual,
matching "the air filter category" by string would mean comparing against both `nameEn` and `nameFa`
everywhere the fitment engine runs. Instead `Category` gets a `partType` enum (`ENGINE_OIL`, `FILTER`,
`ACCESSORY`, `OTHER`) and, when `partType = FILTER`, a `filterKind` enum (`OIL_FILTER`, `AIR_FILTER`,
`CABIN_FILTER`, `FUEL_FILTER` — your four). You can still rename/re-describe the categories in either
language freely; the fitment engine keys off the enum, not the label. If a 5th filter type shows up
later (e.g. transmission filter), add one enum value — no migration of existing data needed.

**5. Engine oil can have STANDARD, HOT, or COLD variants — other categories don't need this, but the
field exists on all of them for consistency.** `FitmentProfileItem.climate` defaults to `STANDARD`
(one right answer, most cars/most categories). For a car where the manual specifies a different
viscosity for hot vs. cold climates, you add two items for the same profile + Engine Oil category:
one `climate = HOT`, one `climate = COLD`, and the storefront shows both with labels ("For hot
climates: 0W-20" / "For cold climates: 5W-30"). This also covers "more than one valid product for the
same category" generally — e.g. two acceptable oil filter brands are just two items, same category,
same climate, differentiated by `priority`; they're co-equal valid options, not a fallback chain.

**6. "Buy it or get help" is modeled as a nullable product reference, not a boolean flag.**
`FitmentProfileItem.productId` is nullable. When it's set, the storefront shows a real, buyable
product. When it's null, `specNote` (plain text, e.g. "5W-30, API SP / ILSAC GF-6") and optionally
`specAttributes` (structured JSON, e.g. `{"viscosity":"5W-30","apiRating":"SP"}`) still tell the user
exactly what to look for, with a "we don't carry this yet — request it" call to action. That request
becomes a `FitmentInquiry` row (Phase 12) — a lightweight lead-capture queue the admin can work.

**7. Car pages are SEO pages, not just lookup utility.** "Best engine oil for Toyota Camry 2018-2023"
is exactly the kind of long-tail query worth ranking for, so `CarModel` and `CarEngine` get their own
bilingual name/description/meta fields and slugs too — they're built as real content pages later, not
just internal lookup keys. Flagging this since it wasn't explicitly asked for, but it's close to free
given the rest of the data structure.

**8. OEM part numbers live on Product.** `oemPartNumbers: String[]` lets a customer who knows their
OEM code (common for auto parts shoppers) find the matching product directly, and gives you another
free source of long-tail search traffic (people search the OEM code itself).

**9. Fitment is defined once as a reusable "Fitment Profile," then attached to as many car engines
as share it — not re-entered per engine.** In practice, dozens of car engines (e.g. a Peugeot 206
Type 2 and Type 5, both 2000-2020) run the identical engine family and need the identical recommended
oil and filters. Modeling fitment directly on `CarEngine` (as the original `FitmentRecommendation`
did) would mean re-creating the same rows on every matching engine, and re-editing all of them again
the day a product gets swapped. Instead: `FitmentProfile` holds a set of `FitmentProfileItem` rows
(one per category + climate, exactly like before — including multiple items for the same category
when more than one product is a valid recommendation), and a `CarEngineFitmentProfile` join table
attaches that profile to any number of `CarEngine` rows. You build the profile once, bulk-attach it
to every matching engine (filtered by brand/model/year range, not one-by-one), and editing the
profile later updates every attached engine at once. This replaces Phase 8's original per-engine
design — see Task 8.4 (redesigned) and Task 8.6 (migration path, since Phase 8 as originally written
modeled fitment directly on `CarEngine`).

If any of these calls doesn't match how you actually want this to work, say so — everything
downstream assumes this shape.

---

## Phase 0 — Project Bootstrap

### Task 0.1 — Init repo + conventions

**DoD:** `pnpm dev` runs a blank Next.js 16 app; ESLint/Prettier configured; `AGENTS.md` exists
documenting folder structure, naming conventions, and the bilingual-field convention; Git repo
pushed to GitHub.
**Prompt:**

```
Initialize a new Next.js 16 project (App Router, TypeScript, Tailwind CSS) using pnpm.
Set up ESLint + Prettier with sensible defaults. Configure strict TypeScript.
Create this folder structure:
  app/(auth)/login
  app/admin/...          # protected route group for the admin panel
  app/api/...            # route handlers
  components/ui/         # shared primitives
  components/admin/      # admin-composed components
  lib/                   # auth, db, validation, utils
  server/                # data access / service layer
  types/
  prisma/
Create an AGENTS.md at the repo root documenting: this folder structure, naming conventions
(PascalCase components, camelCase functions, kebab-case routes), the rule that every list screen
uses a shared DataTable component and every form uses shared Form primitives (built in a later
task), and the bilingual content convention: any user-facing text field is stored as a pair of
columns (e.g. nameEn/nameFa, shortDescriptionEn/shortDescriptionFa) and always edited via the
shared BilingualTextField/BilingualTextareaField components — never a single free-text field for
anything a customer will eventually read. Initialize git, create .gitignore, first commit.
```

### Task 0.2 — Install HeroUI + theme

**DoD:** HeroUI provider wired; a demo page renders a themed button, input, table, modal.
**Prompt:**

```
Install and configure HeroUI with its provider in the Next.js app. Set up a Tailwind theme
(colors, radius, fonts) with a deep amber/oil-drum accent color (#c2410c, adjust if you prefer)
as primary, matching a clean, minimal admin-dashboard aesthetic — favor whitespace and restraint
over dense data-heavy layouts. Create a temporary /dev-preview page rendering a HeroUI Button,
Input, Table, and Modal so I can confirm theming works, then remove it once confirmed.
```

### Task 0.3 — Local Postgres + Prisma init

**DoD:** `docker compose up db` starts local Postgres; `npx prisma db push` succeeds.
**Prompt:**

```
Add a docker-compose.yml for local development with a single postgres:16 service
(volume-backed, exposed on 5432, credentials from .env). Install Prisma, run
`prisma init`, point DATABASE_URL at the local compose Postgres. Add a .env.example
documenting DATABASE_URL, JWT_SECRET, NODE_ENV, COOKIE_NAME.
```

---

## Phase 1 — Data Model (do this before any UI work)

### Task 1.1 — Full Prisma schema

**DoD:** `prisma migrate dev` creates all tables without errors; schema reviewed field-by-field
against the list below, including the bilingual-field and car-fitment models.
**Prompt:**

```
Create the Prisma schema (prisma/schema.prisma) with the following models. Use enums where
noted. Every model needs id (cuid), createdAt, updatedAt. Any field described as "bilingual"
means two columns, suffixed En/Fa (e.g. nameEn, nameFa) — not a JSON blob, not a translation
table.

User: email (unique), phone (unique, nullable), passwordHash, firstName, lastName,
  role (enum: ADMIN, CUSTOMER), status (enum: ACTIVE, INACTIVE)

Category: nameEn, nameFa (bilingual), slug (unique, single/ASCII), tags (String[]),
  shortDescriptionEn/Fa, longDescriptionEn/Fa (bilingual), metaTitleEn/Fa, metaDescriptionEn/Fa
  (bilingual, nullable, SEO), image (nullable String url), status (enum: ACTIVE, INACTIVE),
  partType (enum: ENGINE_OIL, FILTER, ACCESSORY, OTHER),
  filterKind (enum: OIL_FILTER, AIR_FILTER, CABIN_FILTER, FUEL_FILTER — nullable, only
  meaningful when partType = FILTER)
  relation: products (Product[])

Brand: nameEn, nameFa (bilingual), slug (unique), logo (nullable String url),
  status (enum: ACTIVE, INACTIVE)
  relation: products (Product[])

Product: nameEn, nameFa (bilingual), sku (unique), categoryId (FK), brandId (FK),
  price (Decimal), discountPercent (Int, default 0), tags (String[]),
  oemPartNumbers (String[], cross-reference codes for search),
  shortDescriptionEn/Fa, longDescriptionEn/Fa (bilingual),
  metaTitleEn/Fa, metaDescriptionEn/Fa (bilingual, nullable, SEO),
  image (nullable String url), status (enum: ACTIVE, INACTIVE)
  relation: inventory (Inventory, one-to-one), orderItems (OrderItem[]),
  fitmentProfileItems (FitmentProfileItem[])
  NOTE: finalPrice is NOT stored — compute price * (1 - discountPercent/100) at read time.

Inventory: productId (FK, unique), stock (Int, default 0), lastUpdatedAt (DateTime)
  NOTE: status (In Stock / Low Stock / Out of Stock) is derived from stock, not stored —
  document thresholds as a comment (0 = out of stock, <10 = low stock).

CarBrand: nameEn, nameFa (bilingual), slug (unique), logo (nullable String url),
  status (enum: ACTIVE, INACTIVE)
  relation: models (CarModel[])

CarModel: carBrandId (FK), nameEn, nameFa (bilingual), slug (unique per brand),
  metaTitleEn/Fa, metaDescriptionEn/Fa (bilingual, nullable, SEO), image (nullable String url),
  status (enum: ACTIVE, INACTIVE)
  relation: engines (CarEngine[])

CarEngine: carModelId (FK), labelEn, labelFa (bilingual, e.g. "2.5L I4 Petrol"),
  yearStart (Int), yearEnd (Int, nullable — nullable means still in production),
  fuelType (enum: PETROL, DIESEL, HYBRID, ELECTRIC, LPG_CNG), displacementCc (Int, nullable),
  engineCode (String, nullable), status (enum: ACTIVE, INACTIVE)
  relation: fitmentProfileLinks (CarEngineFitmentProfile[])

FitmentProfile: label (String — internal admin-only identifier, never shown to customers, e.g.
  "Peugeot 206 TU5 1.6 8v — Standard"), internalNote (Text, nullable)
  relation: items (FitmentProfileItem[]), carEngineLinks (CarEngineFitmentProfile[])

FitmentProfileItem: profileId (FK), categoryId (FK), climate (enum: STANDARD, HOT, COLD;
  default STANDARD — only meaningfully varies for partType=ENGINE_OIL, but the field exists on
  all rows for consistency), productId (FK to Product, NULLABLE), specNote (Text, nullable —
  human-readable guidance shown when productId is null, e.g. "5W-30, API SP / ILSAC GF-6"),
  specAttributes (Json, nullable — structured spec e.g. {"viscosity":"5W-30","apiRating":"SP"}),
  priority (Int, default 0 — display order when a category+climate has more than one valid item;
  items are co-equal valid options, not a strict fallback chain), adminNote (Text, nullable,
  internal only)

CarEngineFitmentProfile: carEngineId (FK), profileId (FK), unique([carEngineId, profileId])
  — the join table that lets one profile be attached to many engines (and, less commonly, one
  engine to reference more than one profile). A car's resolved fitment recommendations come from
  walking CarEngine → CarEngineFitmentProfile → FitmentProfile → FitmentProfileItem.

FitmentInquiry: carEngineId (FK, nullable), categoryId (FK, nullable), customerName,
  phone, email (nullable), message (Text, nullable), status (enum: NEW, CONTACTED, RESOLVED),
  adminNote (Text, nullable)

Order: customerId (FK to User), status (enum: PENDING, SENDING, SENT, DELIVERED, CANCELLED),
  paymentStatus (enum: UNPAID, PAID, REFUNDED), subtotal, discount, shippingCost, tax, total
  (all Decimal), shippingAddress, postalCode, adminNote (nullable Text)
  relation: items (OrderItem[])

OrderItem: orderId (FK), productId (FK), productNameSnapshot, priceSnapshot (Decimal),
  quantity (Int), lineTotal (Decimal)
  NOTE: snapshot fields exist so historical orders don't change if the product is edited later.

Setting: key (String, unique), value (String) — key-value store for General/Shipping/Payment/
  SEO/Localization admin settings (see Phase 13).

Customer profile fields (phone, address book) can live on User directly for now — do not
over-model; we'll extend when a storefront exists.

Run `prisma migrate dev --name init` and confirm it applies cleanly.
```

### Task 1.2 — Seed script

**DoD:** `pnpm prisma:seed` populates realistic sample data, including at least one Fitment Profile
attached to two different car engines (proving the reuse case), a HOT/COLD engine-oil pair within a
profile, and at least one profile item with `productId = null` (spec-only, no matching product yet).
**Prompt:**

```
Write a prisma/seed.ts that creates:
- 1 admin user
- 5 categories: Engine Oil (partType ENGINE_OIL), Oil Filter, Air Filter, Cabin Filter,
  Fuel Filter (all partType FILTER with the matching filterKind), with bilingual EN/FA
  names/descriptions
- 4 brands (e.g. Mobil 1, Castrol, Bosch, Mann-Filter) with bilingual names, slugs
- 10 products distributed across those categories/brands with varying price/discount/stock
  (include at least one low-stock and one out-of-stock item), bilingual names/descriptions,
  a couple with oemPartNumbers populated
- 3 car brands (e.g. Toyota, Peugeot, Hyundai) each with 2 models, each model with 1-2 engines
  covering different year ranges — bilingual names throughout. Make Peugeot's two models "206 Type
  2" and "206 Type 5" specifically, each with one engine covering 2000-2020, so the shared-profile
  case below has two real engines to attach to.
- Fitment profiles: create at least 2 FitmentProfiles. One, e.g. "Peugeot 206 TU5 1.6 8v —
  Standard", with items covering all 5 categories — two Engine Oil items (climate HOT and climate
  COLD, pointing at two different seeded oil products) plus one item per filter category pointing at
  a seeded product — attached via CarEngineFitmentProfile to BOTH the "206 Type 2" and "206 Type 5"
  engines (don't create two separate profiles for these). A second profile for a different car
  brand/engine with at least one item that has productId null and a populated specNote +
  specAttributes (to exercise the "no product yet" path).
- 2 fitment inquiries in different statuses (NEW, CONTACTED)
- 5 customers; 5 orders in different statuses (Pending, Sending, Delivered, Cancelled) with
  1-3 items each and correct computed totals
Wire it into package.json's prisma.seed config and run it.
```

### Task 1.3 — Zod validation schemas

**DoD:** One Zod schema per writable model (create + update variants where they differ),
unit-tested, including the fitment models.
**Prompt:**

```
In lib/validation/, create Zod schemas mirroring the Prisma models from Task 1.1: productSchema
(create/update), categorySchema, brandSchema, carBrandSchema, carModelSchema, carEngineSchema,
fitmentProfileSchema (label required, internalNote optional), fitmentProfileItemSchema (validate:
if the related category's partType is not ENGINE_OIL, climate must be STANDARD; at least one of
productId/specNote must be present), carEngineFitmentProfileSchema (attach/detach — carEngineId
and profileId both required), fitmentInquirySchema, orderStatusUpdateSchema, orderNoteSchema,
inventoryUpdateSchema, customerStatusSchema, settingsSchema, loginSchema. Each should validate types, required fields,
string lengths, and numeric ranges (e.g. discountPercent 0-100, price >= 0, yearStart <= yearEnd
when yearEnd is present). Write unit tests (Vitest or Jest, whichever is already configured)
covering one valid and one invalid case per schema, plus the climate/partType cross-field rule.
```

---

## Phase 2 — Authentication

_(Identical to a standard admin build — no oil/filter-specific changes.)_

### Task 2.1 — Auth utility library

**DoD:** Unit tests pass for hash/verify and JWT sign/verify/expiry.
**Prompt:**

```
In lib/auth/, implement: hashPassword/verifyPassword using bcryptjs; signToken/verifyToken
using JWT (7-day expiry, payload = {userId, role}); cookie helpers to set/clear an
HTTP-only, Secure (in production), SameSite=Lax cookie named per COOKIE_NAME env var.
Write unit tests for all of the above, including an expired-token case.
```

### Task 2.2 — Auth API routes

**DoD:** All routes validated with Zod, return consistent `{success, data|error}` JSON,
integration-tested.
**Prompt:**

```
Implement these Next.js Route Handlers under app/api/auth/:
POST /login — validate with loginSchema, verify credentials, issue cookie, return user
  (no password hash).
POST /logout — clear the cookie.
GET /me — read the cookie, verify JWT, return the current user or 401.
Only ADMIN-role users may log into the admin panel; reject CUSTOMER role logins here
with a clear error message. Write integration tests for success, wrong password,
non-admin role, and missing/expired token.
```

### Task 2.3 — Route protection middleware

**DoD:** Unauthenticated and non-admin access to /admin/\* is blocked with a redirect to
/login; verified by test.
**Prompt:**

```
Add Next.js middleware that protects the app/admin/* route group: verify the auth cookie's
JWT, confirm role === ADMIN, redirect to /login with a `from` query param if not. Allow
/login and static assets through untouched. Add a test (or a documented manual QA step if
middleware testing isn't set up yet) confirming an unauthenticated request to /admin/products
redirects correctly.
```

### Task 2.4 — Login page UI

**DoD:** Simple, minimal login screen; client + server validation aligned; success redirects
to /admin/dashboard.
**Prompt:**

```
Build the /login page: email field, password field, "Forgot password?" link (can link to a
not-yet-built route), Login button. Keep it minimal — centered card, no clutter. Use React
Hook Form + zodResolver(loginSchema) + HeroUI inputs. On submit, call POST /api/auth/login;
show inline error on failure; redirect to /admin/dashboard on success.
```

### Task 2.5 — Zustand auth store

**DoD:** Store reflects login/logout without a full page reload; used by the admin topbar.
**Prompt:**

```
Create a Zustand store (lib/store/auth.ts) holding the current user and a loading flag.
Hydrate it from GET /api/auth/me on app load. Expose a logout() action that calls
POST /api/auth/logout, clears the store, and redirects to /login.
```

---

## Phase 3 — Admin Shell (build once, reuse everywhere)

### Task 3.1 — Admin layout

**DoD:** Layout wraps all app/admin/\* routes; active nav item highlights per current route.
**Prompt:**

```
Build the admin layout (app/admin/layout.tsx): a minimal sidebar+topbar shell — sidebar with
nav items Dashboard, Products, Categories, Brands, Cars & Fitment, Inventory, Orders,
Customers, Inquiries, Settings, Logout — active item highlighted in the accent color. Keep
the sidebar uncluttered (icon + label, generous spacing, no nested flyouts unless a section
needs one — Cars & Fitment will, see Phase 8). Topbar shows the page title (passed via a prop
or route segment) and an admin avatar/name pulled from the Zustand auth store, with a logout
affordance.
```

### Task 3.2 — Shared DataTable component

**DoD:** One working demo instance with mock data; props documented in AGENTS.md.
**Prompt:**

```
Build components/admin/DataTable.tsx: a generic table taking columns (key, label, optional
render fn), rows, a search input bound to a debounced onSearch callback, an optional row of
filter dropdowns (label + options + onChange), pagination controls, and a status-column
renderer that shows a colored pill (green=Active/InStock/Delivered/Paid/Resolved,
red=Inactive/OutOfStock/Cancelled, orange=Pending/LowStock/New, blue=Sending/Sent/Contacted).
This will be reused by every list screen in the app — do not hardcode anything
module-specific. Add a demo usage example and document the prop shape in AGENTS.md.
```

### Task 3.3 — Shared form primitives (including bilingual fields)

**DoD:** Used to build one real form (Category, in Phase 5) as proof it's reusable, including
one bilingual field.
**Prompt:**

```
Build components/admin/form/: TextField, TextareaField, SelectField, TagsInput,
ImageUploadField, ToggleField — each wrapping a React Hook Form controller + HeroUI component
+ Zod error display, styled consistently (label above, input below, red error text under
invalid fields, generous whitespace — keep it minimal, not dense).

Also build BilingualTextField and BilingualTextareaField: each renders two stacked or
side-by-side inputs bound to two form fields (e.g. nameEn/nameFa), labeled "English" / "فارسی",
with the Persian input given dir="rtl" and a font that renders Persian script cleanly. These
are the only components used anywhere a bilingual pair (En/Fa) is edited — never build a
one-off pair of TextFields for this.

Export a FormActions component rendering Save (primary) + Cancel (outline) buttons.
```

---

## Phase 4 — Dashboard (build the shell now, fill in real data in Phase 14)

### Task 4.1 — Dashboard placeholder

**DoD:** Route exists, protected, renders static stat cards + empty recent-orders table — real
data wired in Task 14.1.
**Prompt:**

```
Build app/admin/dashboard/page.tsx: five stat cards (Total Orders, Revenue, Products, Low
Stock, Open Inquiries) and a "Recent Orders" DataTable. Use hardcoded placeholder values for
now — this will be wired to real aggregation data in a later task once Orders, Products, and
Fitment Inquiries exist. Make it the default route admins land on after login.
```

---

## Phase 5 — Categories

### Task 5.1 — Categories API

**DoD:** All 4 endpoints validated, integration-tested, slug auto-generated from the English
name if not provided, partType/filterKind persisted correctly.
**Prompt:**

```
Implement app/api/admin/categories/ route handlers:
GET / — list with ?search=&status=&partType=&page=&pageSize=, returns categories +
  productCount (count of related products) + total count for pagination. Search should match
  against both nameEn and nameFa.
POST / — create, validated with categorySchema; auto-generate slug from nameEn via slugify
  if not explicitly provided; reject duplicate slugs with a clear error; if partType !=
  FILTER, force filterKind to null regardless of input.
GET /:id, PATCH /:id, DELETE /:id — standard CRUD, DELETE should soft-fail with a clear
  error if the category has products (don't allow orphaning products).
Write integration tests for each route including the duplicate-slug, delete-with-products,
and partType/filterKind consistency cases.
```

### Task 5.2 — Categories List UI

**DoD:** Full list works against real API: search, status + part-type filter, pagination,
edit/delete actions.
**Prompt:**

```
Build app/admin/categories/page.tsx: DataTable with columns Image, Category (English name),
Slug, Part Type, Products, Status, Actions; search box; Status filter; Part Type filter
(Engine Oil / Filter / Accessory / Other); "+ Add Category" button linking to the add form.
Wire to GET /api/admin/categories. Delete action should show a confirm dialog before calling
DELETE.
```

### Task 5.3 — Category Add/Edit form

**DoD:** Same form handles both create and edit; slug auto-generates from the English name but
remains editable; filterKind field only appears/is enabled when Part Type = Filter.
**Prompt:**

```
Build app/admin/categories/[[...id]]/page.tsx per your preferred add/edit routing pattern:
Name (BilingualTextField), Slug (auto-fill from English name, editable), Part Type
(SelectField: Engine Oil / Filter / Accessory / Other), Filter Kind (SelectField: Oil Filter /
Air Filter / Cabin Filter / Fuel Filter — only rendered and required when Part Type = Filter),
Tags (TagsInput), Status (ToggleField), Short Description (BilingualTextareaField), Long
Description (BilingualTextareaField), Meta Title (BilingualTextField, SEO, collapsed under an
"SEO" section), Meta Description (BilingualTextareaField, SEO), Image (ImageUploadField). On
save, POST or PATCH accordingly, redirect to the list on success, show field-level errors on
failure.
```

---

## Phase 6 — Brands

_(Same pattern as Phase 5, no tags/partType/filterKind — just bilingual name + SEO + logo.)_

### Task 6.1 — Brands API

**Prompt:**

```
Implement app/api/admin/brands/ route handlers identical in shape to Task 5.1's Categories API
(list w/ search across nameEn/nameFa + status + pagination + productCount, create w/ slug
auto-gen from nameEn, get/update/delete with the same delete-with-products guard).
Integration-test the same cases.
```

### Task 6.2 — Brands List UI

**Prompt:**

```
Build app/admin/brands/page.tsx: DataTable with columns Logo, Brand (English name), Slug,
Products, Status, Actions; search + status filter; "+ Add Brand" button. Wire to GET
/api/admin/brands.
```

### Task 6.3 — Brand Add/Edit form

**Prompt:**

```
Build the Brand add/edit route: Name (BilingualTextField), Slug (auto-fill, editable), Logo
(ImageUploadField), Status (ToggleField). No description/tags — this form is intentionally
small.
```

---

## Phase 7 — Products

### Task 7.1 — Products API

**DoD:** finalPrice computed and returned (never stored); filtering by category/brand/status/
search (including OEM part number search) all work together.
**Prompt:**

```
Implement app/api/admin/products/ route handlers:
GET / — list with ?search=&category=&brand=&status=&page=&pageSize=, joins category/brand
  names, includes current stock from Inventory, computes finalPrice = price * (1 -
  discountPercent/100) in the response (do not store it). Search should match nameEn, nameFa,
  sku, and oemPartNumbers.
POST / — create; also creates a linked Inventory row with stock=0.
GET /:id, PATCH /:id, DELETE /:id — standard CRUD; DELETE should block if the product has
  order history (has OrderItems) or is referenced by any FitmentProfileItem — deactivate
  instead in that case, with a clear error naming which Fitment Profiles reference it.
Also implement GET /api/admin/categories/options and /api/admin/brands/options returning
{id, nameEn} pairs for the product form's select inputs.
Integration-test list filtering combinations, OEM search, and the delete-blocked cases.
```

### Task 7.2 — Products List UI

**Prompt:**

```
Build app/admin/products/page.tsx: DataTable with columns Image, Name (English), Category,
Brand, Price, Stock, Discount, Status, Actions; search + Category/Brand/Status filter
dropdowns (populated from the /options endpoints); "+ Add Product" button.
```

### Task 7.3 — Product Add/Edit form

**Prompt:**

```
Build the Product add/edit route: Name (BilingualTextField), SKU, Category (SelectField from
options), Brand (SelectField from options), OEM Part Numbers (TagsInput), Tags (TagsInput),
Short Description (BilingualTextareaField), Long Description (BilingualTextareaField), Price,
Discount %, a read-only computed Final Price display that updates live as price/discount
change, Meta Title / Meta Description (BilingualTextField/BilingualTextareaField, under an SEO
section), Product Image (ImageUploadField), Status (ToggleField). Stock is NOT edited here —
note in the UI that stock is managed from the Inventory screen.
```

---

## Phase 8 — Cars & Fitment (the new module — the core of this app)

This is the module Technotopia never had. It has its own sidebar section with three sub-pages
(Car Brands, Car Models & Engines, Fitment Profiles) plus a preview tool. Build it in this order —
each level depends on the one before it existing.

**If you already built Tasks 8.1-8.5 from an earlier version of this doc and pushed to GitHub:**
Tasks 8.1-8.3 (Car Brands, Car Models, Car Engines) are unchanged — nothing to redo. Task 8.4 below
is a redesign of what you built (per-engine `FitmentRecommendation` → reusable `FitmentProfile`, see
Design Decision 9) to solve the "same oil across 40 engines" data-entry problem — don't rebuild it
from scratch; Task 8.6 is the migration prompt that adapts your existing code and data. Task 8.5
(Fitment Preview) needs a small follow-up patch, noted inline below, not a rebuild.

### Task 8.1 — Car Brands API + UI

**DoD:** Identical shape to Brand (Phase 6) — proves the pattern reuses cleanly.
**Prompt:**

```
Implement app/api/admin/car-brands/ route handlers (list w/ search across nameEn/nameFa +
status + pagination + modelCount, create w/ slug auto-gen from nameEn, get/update/delete —
DELETE blocked with a clear error if the brand has car models). Build
app/admin/cars/brands/page.tsx (DataTable: Logo, Brand, Slug, Models, Status, Actions; search +
status filter; "+ Add Car Brand") and the add/edit form (Name BilingualTextField, Slug, Logo
ImageUploadField, Status ToggleField). Integration-test list/create/delete-with-models.
```

### Task 8.2 — Car Models API + UI

**DoD:** Models list is scoped to (and navigable from) a selected car brand; SEO fields present
since these become content pages later.
**Prompt:**

```
Implement app/api/admin/car-models/ route handlers: GET / with ?carBrandId=&search=&status=&
page=&pageSize= (carBrandId required or the list is meaningless — enforce it), returns models +
engineCount; POST / create (slug unique within the brand, auto-gen from nameEn); GET/:id,
PATCH/:id, DELETE/:id (block delete if the model has engines).
Build app/admin/cars/brands/[carBrandId]/models/page.tsx: breadcrumb back to the car brand,
DataTable (Image, Model, Slug, Engines, Status, Actions), "+ Add Model". Add/edit form: Name
(BilingualTextField), Slug, Image (ImageUploadField), Meta Title/Description
(BilingualTextField/BilingualTextareaField, SEO section), Status (ToggleField). Integration-test
the scoping and delete-with-engines guard.
```

### Task 8.3 — Car Engines API + UI

**DoD:** Engine rows carry the year range and fuel/displacement details fitment and the future
storefront wizard depend on.
**Prompt:**

```
Implement app/api/admin/car-engines/ route handlers: GET / with ?carModelId=&search=&status=&
page=&pageSize= (carModelId required); POST / create (validate yearStart <= yearEnd when
yearEnd present); GET/:id, PATCH/:id, DELETE/:id (block delete if the engine has fitment
recommendations).
Build app/admin/cars/brands/[carBrandId]/models/[carModelId]/engines/page.tsx: breadcrumb back
to brand → model, DataTable (Label, Years, Fuel Type, Displacement, Engine Code, Status,
Actions), "+ Add Engine". Add/edit form: Label (BilingualTextField, e.g. "2.5L I4 Petrol" /
Persian equivalent), Year Start / Year End (numeric fields, Year End optional with a "still in
production" toggle that nulls it), Fuel Type (SelectField: Petrol/Diesel/Hybrid/Electric/LPG-
CNG), Displacement cc (numeric, optional), Engine Code (text, optional), Status (ToggleField).
Integration-test the year-range validation and delete-with-fitment guard.
```

### Task 8.4 — Fitment Profiles API + UI

**DoD:** A Fitment Profile is created once and attached to any number of car engines in bulk — an
admin should never have to re-enter the same recommendation per engine. Supports multiple items per
category (climate variants, or multiple co-equal valid products), and the spec-only (no product)
path.
**Prompt:**

```
Implement app/api/admin/fitment-profiles/ route handlers:
GET / — list with ?search=&page=&pageSize=, returns profiles with item count and linked-engine
  count.
POST / — create (label required).
GET /:id — full detail: items (joined category name, climate, product name or null, specNote,
  priority) and linked car engines (joined brand/model/engine label).
PATCH /:id, DELETE /:id — standard CRUD; DELETE should block with a clear error if the profile is
  still linked to any car engine (admin must detach first).
POST /:id/items, PATCH /:id/items/:itemId, DELETE /:id/items/:itemId — manage a profile's line
  items, validated with fitmentProfileItemSchema (climate forced to STANDARD unless the category's
  partType is ENGINE_OIL; at least one of productId/specNote required).
POST /:id/attach — accepts {carEngineIds: string[]}, bulk-creates CarEngineFitmentProfile rows
  (skip any that already exist rather than erroring).
DELETE /:id/attach/:carEngineId — detach one engine from the profile.
GET /api/admin/car-engines/searchable — returns {id, label} pairs filterable by ?carBrandId=&
  carModelId=&yearFrom=&yearTo=&search=, for the attach picker below.

Build app/admin/cars/fitment-profiles/page.tsx: DataTable (Label, Items, Linked Engines, Actions),
search, "+ Add Profile". Build the profile editor (app/admin/cars/fitment-profiles/[id]/page.tsx):
- Profile Label (TextField), Internal Note (TextareaField)
- Items table: Category, Climate (disabled/forced Standard unless category's partType is Engine
  Oil), Product (searchable SelectField, optional), Spec Note (TextareaField, shown prominently
  when no product selected), Spec Attributes (key-value repeater), Priority, Admin Note, per-row
  Edit/Delete, "+ Add Item"
- Linked Car Engines panel: chips showing brand/model/engine label per attached engine with a
  Detach action, and an "Attach Engines" button opening a modal with Car Brand/Car Model/Year-range
  filters over a multi-select list (backed by GET /car-engines/searchable) plus an "Attach N
  Engines" confirm button that calls POST /:id/attach once with all selected IDs — this bulk action
  is the whole point: attaching a profile to 40 matching engines should be one action, not 40.

Also add a lightweight entry point from each Car Engine's own page (built in Task 8.3): a "Fitment"
tab/section showing whatever profile(s) are currently attached (usually one) with a link to that
profile's editor, an "Attach Existing Profile" search-and-pick control, and a "Create New Profile
for This Engine" shortcut that creates a profile pre-attached to just this engine and redirects to
its editor.

Integration-test: profile CRUD, delete-blocked-while-linked, item climate/partType rule, bulk
attach (including the skip-existing-link case), detach.
```

### Task 8.5 — Fitment Preview tool

**DoD:** Lets an admin walk the same Brand → Model → Year → Engine flow a customer eventually
will, and see exactly what would be recommended — the QA tool for all the data entered in
8.1-8.4 before the storefront exists to display it. **If you already built this against the old
per-engine `FitmentRecommendation` shape, this is a small follow-up patch, not a rebuild:** only the
data-fetching query changes (resolve via `CarEngineFitmentProfile` → `FitmentProfile` →
`FitmentProfileItem` instead of a direct `carEngineId` filter); the page layout and grouping-by-
category behavior described below stay the same.
**Prompt:**

```
Build (or patch) app/admin/cars/preview/page.tsx: four cascading SelectFields — Car Brand, Car Model
(options load once a brand is picked), Year (options computed by expanding the yearStart/yearEnd
ranges of that model's engines — not a separate table), Engine (only shown if more than one engine
covers the selected year). Once an engine is resolved, fetch its attached Fitment Profile(s) (via
CarEngineFitmentProfile) and render their combined items grouped by category, each showing either
the recommended product (name, price, image) or the spec-only fallback text — visually distinguished
(e.g. a "Spec only — not yet in catalog" badge) so an admin can spot gaps in fitment coverage at a
glance. If a category has more than one item (e.g. two acceptable oil filter brands), show all of
them under that category, not just the first. This page calls the same read path the storefront will
eventually use — treat it as a read-only internal consumer, not a special-cased admin-only endpoint.
```

### Task 8.6 — Migrate existing Fitment Recommendations to Fitment Profiles

**Only needed if you already built the original Task 8.4/8.5 against a per-engine
`FitmentRecommendation` model and have real data in it — skip this task entirely if you're building
Phase 8 fresh from this version of the doc.**

**DoD:** Every existing `FitmentRecommendation` row is preserved (as a `FitmentProfileItem` under a
new one-engine-only `FitmentProfile`), no data loss, old model removed once verified; the Fitment
Preview tool returns identical results before and after for a spot-checked sample of engines.
**Prompt:**

```
Add FitmentProfile, FitmentProfileItem, and CarEngineFitmentProfile to the Prisma schema (see Task
1.1's updated model definitions). Write a one-time migration script (e.g. scripts/migrate-fitment.ts,
run once via pnpm, not a Prisma migration) that: for every CarEngine with one or more existing
FitmentRecommendation rows, creates a new FitmentProfile labeled "{car brand} {car model} {engine
label} (migrated)", moves each of that engine's FitmentRecommendation rows into a FitmentProfileItem
under the new profile (same categoryId/climate/productId/specNote/specAttributes/priority/adminNote,
minus carEngineId), and creates one CarEngineFitmentProfile row linking that engine to the new
profile. This intentionally creates a 1:1 profile-per-engine to start — it does not try to detect
which engines should already share a profile, since that's a judgment call for you to make afterward
using Task 8.4's UI (attach one engine's existing profile to another, then delete the now-redundant
one). Run the script, spot-check a few engines' resolved fitment in the Fitment Preview tool against
what they showed before the migration, then drop the old FitmentRecommendation table in a follow-up
migration once confirmed. Update the Task 8.4 API/UI to the new profile-based version if not already
done. Do NOT run this against production data without a backup — this is intended for your current
pre-launch dataset.
```

---

## Phase 9 — Inventory

_(Identical to a standard build — no oil/filter-specific changes beyond referencing the Product
model from Phase 7.)_

### Task 9.1 — Inventory API

**DoD:** Stock update recalculates lastUpdatedAt; status thresholds match Task 1.1's documented
values.
**Prompt:**

```
Implement app/api/admin/inventory/ route handlers:
GET / — list with ?search=&category=&brand=&status=&page=&pageSize=, joining Product +
  Inventory, deriving status from stock using the thresholds documented in the Prisma schema
  comment (0 = Out of Stock, <10 = Low Stock, else In Stock). Search matches nameEn/nameFa/sku.
PATCH /:productId — accepts {addStock: number}, increments stock, updates lastUpdatedAt,
  returns new total. Validate addStock > 0.
Integration-test the derived-status boundary cases (exactly 0, exactly 9, exactly 10).
```

### Task 9.2 — Inventory List UI

**Prompt:**

```
Build app/admin/inventory/page.tsx: DataTable with columns Product (English name), Category,
Brand, Stock, Status, Last Update, Actions; search + Category/Brand/Status filters. Each row's
"Edit" action opens the Stock Edit modal (Task 9.3).
```

### Task 9.3 — Stock Edit modal

**Prompt:**

```
Build a StockEditModal component: shows product name, current stock (read-only), an "Add
Stock" number input, a live-computed "New Total" display, Save/Cancel. On save, PATCH
/api/admin/inventory/:productId and refresh the inventory list without a full page reload.
```

---

## Phase 10 — Orders

_(Identical to a standard build.)_

### Task 10.1 — Orders API

**DoD:** Status transitions enforced in the specified order; totals never recomputed
client-side.
**Prompt:**

```
Implement app/api/admin/orders/ route handlers:
GET / — list with ?search=&status=&payment=&dateFrom=&dateTo=&page=&pageSize=, includes
  customer name, item count, total, status, paymentStatus, date.
GET /:id — full detail: items (with product name/qty/price/lineTotal), customer info,
  shipping address, subtotal/discount/shippingCost/tax/total, status, paymentStatus, adminNote.
PATCH /:id/status — accepts the next status only; enforce the sequence PENDING → SENDING →
  SENT → DELIVERED strictly (reject skipping steps), OR accept CANCELLED from PENDING/SENDING
  only. Return 400 with a clear message on an invalid transition.
PATCH /:id/note — accepts {adminNote: string}, updates it.
Integration-test: valid transition, skipped-step transition (should fail), cancel from an
invalid state (should fail), note update.
```

### Task 10.2 — Orders List UI

**Prompt:**

```
Build app/admin/orders/page.tsx: DataTable with columns Order ID, Customer, Items, Total,
Status, Payment, Date, Actions (View); search + Status/Payment/Date-range filters.
```

### Task 10.3 — Order Details UI

**Prompt:**

```
Build app/admin/orders/[id]/page.tsx: items table (Product/Qty/Price/Total), totals summary
(Subtotal/Discount/Shipping/Tax/Total), Customer info block, Shipping Address block, Payment
status, a status stepper showing Pending → Sending → Sent → Delivered with a "Next Step" button
that calls PATCH /status (disable or hide it appropriately at Delivered/Cancelled), and an Admin
Note textarea with a Save Note button calling PATCH /note.
```

---

## Phase 11 — Customers

### Task 11.1 — Customers API

**Prompt:**

```
Implement app/api/admin/customers/ route handlers:
GET / — list users with role=CUSTOMER, ?search=&status=&page=&pageSize=, including their
  order count.
GET /:id — profile + full order history (reuse the order summary shape from Task 10.1's list
  endpoint, filtered to this customer).
PATCH /:id/status — toggle Active/Inactive.
```

### Task 11.2 — Customers List + Details UI

**Prompt:**

```
Build app/admin/customers/page.tsx (DataTable: Name, Email, Phone, Orders, Status, Actions;
search + status filter) and app/admin/customers/[id]/page.tsx (profile card + Order History
DataTable).
```

---

## Phase 12 — Fitment Inquiries (the "get help" queue)

This is where the "at least the user can get help from our site" requirement lands operationally
— any storefront visitor who hits a spec-only recommendation (Task 8.4/8.5) and asks to be
contacted lands here as a lead for your team to work.

### Task 12.1 — Fitment Inquiries API

**DoD:** List and detail work against seeded data now; the storefront will start actually
creating these rows once it's built.
**Prompt:**

```
Implement app/api/admin/fitment-inquiries/ route handlers:
GET / — list with ?search=&status=&page=&pageSize=, includes joined car engine label and
  category name where present.
GET /:id — full detail (customer name/phone/email/message, car engine, category, status,
  adminNote).
PATCH /:id — accepts {status?, adminNote?}, updates either or both.
Integration-test list filtering and the partial-update PATCH.
```

### Task 12.2 — Fitment Inquiries List + Details UI

**Prompt:**

```
Build app/admin/inquiries/page.tsx: DataTable with columns Customer, Phone, Car, Category,
Status, Date, Actions (View); search + status filter. Build the detail view (modal or
app/admin/inquiries/[id]/page.tsx, your call) showing the full message, car/category context,
a Status SelectField (New/Contacted/Resolved), and an Admin Note textarea with Save.
```

---

## Phase 13 — Settings

### Task 13.1 — Settings API + UI

**DoD:** Key-value settings persisted; tabs switch without a page reload; SEO and Localization
tabs exist alongside the standard General/Shipping/Payment ones.
**Prompt:**

```
Implement GET/PATCH app/api/admin/settings/ (PATCH accepts a partial key-value object, upserts
each). Build app/admin/settings/page.tsx with tabs (client-side switch, no navigation):
- General: Store Name, Support Email, Support Phone, Social Links
- SEO: Default Meta Title template, Default Meta Description, Google Search Console
  verification code, sitemap enabled toggle (documents intent for the future storefront)
- Localization: Default Locale (EN/FA), Supported Locales (multi-select, likely locked to
  EN+FA), a read-only note that FA renders RTL in the storefront
- Shipping and Payment: placeholder fields for now — confirm exact fields with the project
  owner before finalizing
Save Changes button per tab.
```

---

## Phase 14 — Dashboard (real data)

### Task 14.1 — Dashboard aggregation + wire-up

**Prompt:**

```
Implement GET /api/admin/dashboard/summary returning: total order count, total revenue (sum of
DELIVERED order totals), total active product count, low-stock product count (from Inventory),
open fitment inquiry count (status = NEW or CONTACTED). Wire app/admin/dashboard/page.tsx's stat
cards and Recent Orders table (built in Task 4.1) to this real data, replacing the placeholders.
```

---

## Phase 15 — Testing & Hardening

### Task 15.1 — E2E happy paths

**Prompt:**

```
Set up Playwright (or your preferred E2E tool). Write E2E tests for: admin login → dashboard;
create a category → create a brand → create a product using them → verify it appears in the
products list; create a car brand → model → engine → add a fitment recommendation (with a
product) and a second one (spec-only, no product) → verify both appear correctly in the
Fitment Preview tool; edit a product's stock via Inventory → verify list updates; advance an
order through its full status sequence; submit a fitment inquiry status change and confirm it
persists.
```

### Task 15.2 — Security pass

**Prompt:**

```
Audit and harden: rate-limit /api/auth/login (e.g. 5 attempts/15min per IP); confirm every
/api/admin/* route checks the JWT + ADMIN role server-side (not just via middleware — defense
in depth); sanitize any rich-text/description fields (both En and Fa variants) against stored
XSS; confirm image upload validates file type/size server-side; confirm cookies are
Secure+HttpOnly+SameSite in production config.
```

---

## Phase 16 — Dockerization & Deployment

### Task 16.1 — Production Dockerfile

**DoD:** Multi-stage build produces a small final image using Next.js's standalone output.
**Prompt:**

```
Add `output: 'standalone'` to next.config. Write a multi-stage Dockerfile: deps stage
(pnpm install), build stage (pnpm build), runner stage (copy standalone output + static +
public, run as non-root user, EXPOSE 3000, CMD node server.js). Add a .dockerignore.
```

### Task 16.2 — docker-compose for production

**Prompt:**

```
Write docker-compose.prod.yml with three services: app (built from the Dockerfile, env from
.env.production, depends_on postgres), postgres (postgres:16, named volume for data, NOT
exposed publicly), nginx (reverse proxy, depends_on app). Ensure the app service runs
`prisma migrate deploy` on container start before serving traffic.
```

### Task 16.3 — Nginx reverse proxy config

**Prompt:**

```
Write an nginx.conf reverse-proxying to the app service on port 3000: gzip enabled, security
headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy), a server block ready for
certbot SSL (separate HTTP-only block for the ACME challenge + redirect to HTTPS, HTTPS block
once a cert exists). Document the certbot setup steps in a DEPLOYMENT.md.
```

### Task 16.4 — VPS deployment runbook

**Prompt:**

```
Write DEPLOYMENT.md covering: initial Ubuntu VPS setup (docker + docker compose plugin install,
firewall rules for 80/443/22 only, a non-root deploy user), cloning the repo, setting
production .env values, running `docker compose -f docker-compose.prod.yml up -d --build`,
obtaining a certbot certificate, and a basic update/redeploy procedure (git pull, rebuild,
migrate, restart with zero-downtime consideration noted as a future improvement). Note that
when the storefront is built later, EN/FA locale routing will likely need locale-aware
sitemap/robots handling — flag as a follow-up, not needed for the admin panel itself.
```

### Task 16.5 — CI pipeline (optional but recommended)

**Prompt:**

```
Add a GitHub Actions workflow (.github/workflows/ci.yml) that on every PR: installs deps with
pnpm, runs lint, runs unit + integration tests against a throwaway Postgres service container,
and runs `tsc --noEmit`. Fail the PR if any step fails.
```

---

## Suggested execution order

Phase 0 → 1 → 2 → 3 (strict order, foundation).
Phase 4 (dashboard shell) can happen any time after Phase 3.
Phases 5 → 6 → 7 in order (Categories and Brands are referenced by Products).
Phase 8 (Cars & Fitment) after Phase 7 — its Task 8.4 references Products and Categories
directly, and its tasks are themselves strictly ordered (Brand → Model → Engine → Fitment
Profiles → Preview → Migration-if-needed). If you already built through 8.5 under the old
per-engine design, do Task 8.6 next before touching Phase 9+; nothing downstream depends on the
migration, but doing it now avoids carrying the data-entry problem forward as you add more cars.
Phase 9 → 10 → 11 in order (Inventory and Orders both need Products; Orders needs Customers to
exist as Users).
Phase 12 (Inquiries) any time after Phase 8, since it references CarEngine/Category but nothing
else.
Phase 13 (Settings) any time after Phase 3.
Phase 14 (Dashboard real data) last among features — needs Orders, Products, Inventory, and
Inquiries all in place.
Phase 15 continuously — add each module's tests right after building it, don't batch to the end.
Phase 16 once Phases 5-14 are stable; check locally via `docker compose up` before touching the
VPS.
