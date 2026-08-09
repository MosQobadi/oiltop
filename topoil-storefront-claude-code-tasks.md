# Top Oil — Storefront — Claude Code Task List

Companion to `topoil-admin-claude-code-tasks.md` and `storefront-design-brief.md`. Assumes the admin
panel (Phases 0-16 of the admin doc) is built and has real data: Categories, Brands, Products,
Inventory, Car Brands/Models/Engines, Fitment Profiles, Settings.

**Stack:** same as admin — Next.js 16 · TypeScript · React 19 · HeroUI · Tailwind CSS · PostgreSQL ·
Prisma · Zustand · React Hook Form · Zod · JWT + HTTP-only cookies · date-fns · pnpm. No i18n library;
locale is a URL prefix (`/en/...`, `/fa/...`) with paired `xEn`/`xFa` DB columns, per Design Decision 1
in the admin doc.

## How to use this

- Same discipline as the admin doc: one task = one Claude Code session = one commit/PR, in order.
- This assumes the storefront lives in the **same repo** as the admin panel (same Prisma schema, same
  theme tokens) under a new `app/(storefront)` or `app/[locale]` route group — not a separate project.
  If you decide to split it into its own repo later, Phase 0's API contracts are what you'd port.
- **A visual/interaction reference now exists:** `Top Oil.dc.html`, a clickable prototype covering
  Home (with the car-finder wizard), PLP, Cart, Checkout, Account (login/register/order history/
  detail), and PDP in all three states (real product / spec-only+request / hot-cold climate pair).
  It also has a built-in "Handoff notes" page enumerating every component's states and the
  assumptions made where the brief didn't specify (delivery pricing, VAT display, login credential,
  out-of-stock behavior, price-hold window — now resolved below in Design Decisions 7-10). Treat this
  file as the source of truth for copy, layout, spacing, and the exact oklch color tokens whenever a
  task below is ambiguous — paste the relevant section into the Claude Code session alongside the
  task prompt. Currency throughout is Toman; VAT (9%) is shown as an included informational line, not
  added on top; default locale in the prototype is fa (Farsi) — confirm that matches your intended
  storefront default before Task 1.1.

---

## Design decisions (read before Phase 0)

**1. The storefront needs its own public API surface — this doesn't exist yet.** Every admin route
under `/api/admin/*` is JWT+ADMIN gated. The Fitment Preview tool (admin Task 8.5) proves the
*resolution logic* (CarEngine → CarEngineFitmentProfile → FitmentProfile → FitmentProfileItem) works,
but it's only reachable by a logged-in admin. Phase 0 below adds a parallel, unauthenticated
`/api/storefront/*` surface that reuses the same underlying service functions (don't duplicate the
resolution query — extract it to a shared `lib/services/fitment.ts` both the admin preview route and
the new public route call) rather than re-implementing it.

**2. Locale is routing, not a library.** `/en/...` and `/fa/...` are separate route trees sharing one
`app/[locale]/` layout. The layout reads the `[locale]` segment, sets `<html lang dir>` (`rtl` for
`fa`, `ltr` for `en`), and picks `nameEn`/`nameFa` (etc.) accordingly wherever data is rendered. No
`next-intl` or similar — same "paired columns" philosophy as the admin panel's bilingual fields,
carried into rendering rather than editing.

**3. The car-finder wizard is a client-side stepper over four public list endpoints, not one big
payload.** Brand → Model → Year → Engine, each step fetching only what the previous step unlocked
(mirrors the admin Fitment Preview tool's UX exactly, per admin Task 8.5's note that it "calls the
same read path the storefront will eventually use"). Year options are computed client- or server-side
by expanding `yearStart`/`yearEnd` of the selected model's engines — there's still no per-year DB row.

**4. Cart is client-state until checkout, not a DB table.** No guest/persistent server cart model
exists in the schema (admin doc's data model has no `Cart`/`CartItem`). Keep cart in a Zustand store
(persisted to `localStorage` is fine for a storefront, unlike admin-embedded artifacts) and only touch
the database when an `Order` + `OrderItem`s are actually created at checkout. If you want server-side
cart persistence across devices later, that's a schema change to flag separately — not assumed here.

**5. Fitment results attach a car-context breadcrumb to PLP/PDP, not a filter param baked into the
URL long-term.** When a customer arrives at a product via "your BMW X6 2006 needs this," carry that
context (e.g. `?fit=<carEngineId>`) so the PDP can show "Fits your BMW X6 2006 (3.0si)" — but the
canonical PDP URL itself (`/en/products/mobil1-5w30`) stays car-agnostic for SEO, per the design
brief's single-slug rule.

**6. Guest checkout is in scope; account creation is optional at checkout, not required.** The schema's
`User` role split (ADMIN/CUSTOMER) and `Order.customerId` FK don't force every order to have a
registered account holder — but since `Order.customerId` is a required FK to `User` in the current
schema, guest checkout still needs *a* `User` row created behind the scenes (role CUSTOMER, no forced
password) unless you want to relax that FK. Flag this to the project owner before Phase 10 — decide
now whether "guest" means "silently create an account" or "make `customerId` nullable."

**7. Storefront login accepts phone or email — both are real credentials, not just a UI choice.**
The `Top Oil.dc.html` prototype's login/register forms only show phone + password, but the decision
(confirmed) is to support both: `User.phone` becomes required + unique for CUSTOMER-role accounts
created via the storefront (a schema change — currently `phone` is optional), `email` stays optional
for customers (unlike admin users, who keep email required). Login accepts either identifier. This is
the one admin-side schema change from this doc that isn't purely additive — touch `User` carefully so
existing admin accounts (email required) aren't broken; scope the "phone required" rule to
`role = CUSTOMER` only, e.g. via a check constraint or application-level validation, not a blanket
column change.

**8. Captured cart prices are honored for 24 hours (confirmed) — this needs a price history table.**
The prototype's cart note ("price captured on add, honoured 24h") can't be implemented safely by
trusting a client-submitted price and timestamp alone — that's an open door to price manipulation.
Instead, add `ProductPriceLog` (productId FK, price, discountPercent, changedAt) and write a row
every time a product's price or discount changes (Product update route, admin Task 7.1). At checkout,
for each cart line the server looks up what the product's price actually was at `addedAt` (the
earliest `ProductPriceLog` row with `changedAt <= addedAt`, or current price if none), and honors that
looked-up price only if `addedAt` is within 24 hours of now — otherwise it re-prices at current price
and the checkout UI flags the line as changed. This keeps the "never trust client-submitted totals"
rule from Task 8.2 intact while still delivering the promised UX.

**9. Out-of-stock "Notify me" is a real feature (confirmed) — needs a new table + a restock trigger.**
Add `StockNotification` (productId FK, contact — email or phone, createdAt, notifiedAt nullable) and a
public storefront route to create one. When the admin Inventory PATCH route (Task 9.1 of the admin
doc) takes a product's stock from 0 to >0, it should look up all un-notified `StockNotification` rows
for that product, send a notification (email is the simpler first cut; SMS can follow), and set
`notifiedAt`. This is genuinely new scope on the admin side — flag it as an addition to admin Task 9.1
when you get to it, not something the storefront can fake on its own.

**10. Delivery pricing is hardcoded for launch (confirmed).** Two flat-rate methods — nationwide
courier and Tehran same-day — ship as constants in the storefront checkout (Task 8.3), not sourced
from Settings. Revisit as an admin-configurable shipping-rules feature post-launch if delivery pricing
needs to vary by region/weight/carrier later.

If any of these doesn't match how you want it to work, say so before running Phase 0.

---

## Phase 0 — Public Storefront API (the gap flagged above)

### Task 0.1 — Extract shared fitment resolution service

**DoD:** `lib/services/fitment.ts` exports a pure function used by both the existing admin Fitment
Preview route and the new public route below; admin Fitment Preview still returns identical results
after the refactor.
**Prompt:**

```
Refactor the fitment resolution logic currently inline in the admin Fitment Preview route
(app/api/admin/... from Task 8.5) into lib/services/fitment.ts, exporting:
- getCarModelsForBrand(carBrandId): CarModel[]
- getYearOptionsForModel(carModelId): number[] (expanded from each engine's yearStart/yearEnd)
- getEnginesForModelYear(carModelId, year): CarEngine[] (engines whose range covers that year)
- resolveFitmentForEngine(carEngineId): items grouped by category, each with either the product
  (id, nameEn/Fa, price, finalPrice, image) or the spec-only fallback (specNote, specAttributes),
  climate label, and priority-ordered when multiple items share a category+climate
Update the admin Fitment Preview route to call this service instead of its inline query. Confirm
the admin tool's output is unchanged (manual spot-check against a few seeded engines is fine).
```

### Task 0.2 — Public car-finder API routes

**DoD:** All four routes are unauthenticated, read-only, and only return `status: ACTIVE` rows.
**Prompt:**

```
Implement app/api/storefront/cars/ route handlers, all public (no auth), all filtering out
INACTIVE rows:
GET /brands — list active CarBrands (id, slug, nameEn/Fa, logo).
GET /brands/:brandSlug/models — active CarModels for that brand.
GET /models/:modelId/years — call getYearOptionsForModel from lib/services/fitment.ts.
GET /models/:modelId/engines?year= — call getEnginesForModelYear; if only one engine matches,
  the response should still return it as an array of one (let the client decide whether to
  auto-skip the Engine step, per the design brief's "skipped automatically" rule).
GET /engines/:engineId/fitment — call resolveFitmentForEngine; also return the engine's own
  brand/model/label for a breadcrumb.
Integration-test each route against seeded data, including the "one engine only" and
"engine with a spec-only item" cases from the admin seed script.
```

### Task 0.3 — Public catalog API routes

**DoD:** Supports PLP filtering/search/pagination and PDP lookup; computes `finalPrice` and derived
stock status the same way the admin Products/Inventory APIs do (Design Decisions in admin doc).
**Prompt:**

```
Implement app/api/storefront/ route handlers, all public, ACTIVE-only:
GET /categories — list active categories (for nav/PLP filters), with partType/filterKind.
GET /brands — list active product brands (for PLP filter).
GET /products — ?category=&brand=&partType=&filterKind=&search=&page=&pageSize=&sort=, search
  matches nameEn/nameFa/oemPartNumbers, response includes finalPrice and derived stock status
  (out/low/in, per the 0/<10 thresholds), never raw stock count if you'd rather not expose exact
  numbers (your call — flag if you want exact counts hidden).
GET /products/:slug — full PDP payload: product fields, category, brand, computed finalPrice,
  stock status, and (if a Fitment Profile references this product) which car engines it fits —
  used for an optional "this fits: BMW X6 2006-2016 (3.0si)..." PDP section.
POST /products/:id/notify-me — public, per Design Decision 9: accepts {contact: string} (email or
  phone), creates a StockNotification row (Task 0.6). Only meaningful when the product is
  currently out of stock; still accept the request otherwise but no-op is fine.
Integration-test filtering combos, the finalPrice computation, the slug-not-found 404 case, and
notify-me create.
```

### Task 0.4 — Fitment inquiry (lead capture) public route

**DoD:** Creates a real `FitmentInquiry` row with status NEW; lightweight validation only (name +
phone required, per the design brief).
**Prompt:**

```
Implement POST /api/storefront/fitment-inquiries — public, rate-limited (e.g. 5/hour per IP,
reuse whatever limiter Task 15.2 set up for login), validated with a new leaner Zod schema
(customerName, phone required; email, message, carEngineId, categoryId optional). Creates a
FitmentInquiry with status NEW. Integration-test success, missing-required-field, and
rate-limit-exceeded cases.
```

### Task 0.5 — Public settings + guest-order support routes

**DoD:** Storefront can read store name/contact/social/locale settings without auth; order creation
route exists for Phase 10 to build on.
**Prompt:**

```
Implement GET /api/storefront/settings — public, returns only the storefront-relevant subset
of the admin Settings key-value store (Store Name, Support Email/Phone, Social Links, default
locale, supported locales) — never expose Shipping/Payment secrets if any get added later.
Also resolve Design Decision 6 (guest checkout vs. nullable customerId) with the project owner
now, and note the decision in a comment here, since Phase 10 depends on it.
```

### Task 0.6 — Schema additions: price log, back-in-stock, phone login (admin-side)

**DoD:** These are the actual admin-panel/schema changes this doc requires — everything else in
Phase 0-11 is additive (new public routes, new storefront pages). Do this task in the admin codebase.
**Prompt:**

```
Extend prisma/schema.prisma:
- User: make `phone` conditionally required — add application-level Zod validation (not a DB
  constraint) requiring phone when role = CUSTOMER and created via the storefront register route;
  keep email required for ADMIN, optional for CUSTOMER. Add a unique constraint on phone (nullable
  unique — Prisma supports this, multiple NULLs allowed).
- Add ProductPriceLog: id, productId (FK), price (Decimal), discountPercent (Int), changedAt
  (DateTime, default now()). 
- Add StockNotification: id, productId (FK), contact (String — email or phone), createdAt,
  notifiedAt (DateTime, nullable).
Update the admin Product update route (Task 7.1) to write a ProductPriceLog row whenever price or
discountPercent actually changes (skip the write if neither changed). Update the admin Inventory
PATCH route (Task 9.1) so that when stock moves from 0 to >0, it finds all StockNotification rows
for that product with notifiedAt = null, sends a notification (email via whatever mailer is
already configured, or a TODO stub if none exists yet — don't block this task on picking an email
provider), and sets notifiedAt. Migrate and integration-test: price-change writes a log row,
no-op update writes nothing, restock-from-zero notifies pending subscribers only once.
```

---

## Phase 1 — Locale Routing & RTL Foundation

### Task 1.1 — `[locale]` route group + middleware

**DoD:** `/en` and `/fa` both resolve to the same pages with correct `<html lang dir>`; visiting `/`
redirects to the default locale from Settings (fallback `en` if unset).
**Prompt:**

```
Create app/[locale]/ as the storefront's route group (separate from app/admin — do not nest
storefront routes under /admin). Add middleware that: validates [locale] is "en" or "fa" (404
otherwise), and redirects "/" to "/{defaultLocale}" using GET /api/storefront/settings' default
locale (fallback "en" on fetch failure). In app/[locale]/layout.tsx, set <html lang={locale}
dir={locale === "fa" ? "rtl" : "ltr"}> and load the Vazirmatn font variable only when locale is
"fa" (Geist otherwise) — both are already wired in the root layout per the design brief, just
apply them conditionally here.
```

### Task 1.2 — Bilingual content helper

**DoD:** One shared helper used everywhere a bilingual field is rendered; unit-tested for both
locales and a missing-Fa-fallback case.
**Prompt:**

```
In lib/i18n/, create a pickLocale(locale, en, fa) helper returning fa if locale === "fa" and fa
is non-empty, else en (graceful fallback for any bilingual field not yet translated). Add a
useLocale() hook/util reading the current [locale] segment client-side. Unit-test the fallback
case explicitly — this matters since Persian content will lag English early on.
```

### Task 1.3 — Locale switcher component

**DoD:** Switching locale preserves the current path (e.g. `/en/products/x` → `/fa/products/x`), not
just redirecting to the new-locale homepage.
**Prompt:**

```
Build components/storefront/LocaleSwitcher.tsx: a small EN/FA toggle (header placement, see Task
2.1) that swaps the [locale] segment of the current path and navigates, preserving the rest of
the URL and query string. Add a data-testid for E2E use later.
```

---

## Phase 2 — Storefront Shell

### Task 2.1 — Header, footer, layout

**DoD:** Shell wraps all `app/[locale]/*` pages; header/footer content is sourced from
`/api/storefront/settings`, not hardcoded, per the design brief's Section 7.
**Prompt:**

```
Build app/[locale]/layout.tsx's visible shell (or a components/storefront/StorefrontShell.tsx it
renders): header with logo/store name (from Settings), primary nav (Home, Categories, Car
Fitment, Cart icon w/ item count from the cart store), LocaleSwitcher; footer with Support
Email/Phone/Social Links (from Settings), copyright, locale-aware links. Mobile-first: nav
collapses to a drawer/hamburger below a defined breakpoint. Match the admin panel's accent color
(#c2410c) and HeroUI component style per the design brief — same design system, not a different
product.
```

### Task 2.2 — Shared storefront primitives

**DoD:** Reused by PLP/PDP/cart in later phases; documented like the admin's DataTable/Form
primitives were.
**Prompt:**

```
Build components/storefront/: ProductCard (image, bilingual name, price w/ strikethrough
original when discounted, stock badge, "fits your car" ribbon slot; when out of stock the CTA
becomes "Notify me" per Design Decision 9, opening a one-field contact capture that posts to
/api/storefront/products/:id/notify-me), PriceDisplay (handles the finalPrice-vs-original
strikethrough logic in one place), StockBadge (in/low/out, three states only per the admin doc's
thresholds), Breadcrumbs. Match Top Oil.dc.html's card states exactly (default/hover/focus/
disabled/loading, documented on its own Handoff notes page). Keep each presentational and
prop-driven, no data fetching inside them.
```

---

## Phase 3 — Car Fitment Wizard (the headline feature)

### Task 3.1 — Wizard state + stepper UI

**DoD:** Four-step flow works end-to-end against Phase 0's routes; Engine step auto-skips when only
one engine matches, per the design brief.
**Prompt:**

```
Build components/storefront/fitment/FitmentWizard.tsx: a 4-step stepper (Brand → Model → Year →
Engine) using GET /api/storefront/cars/brands, /brands/:slug/models, /models/:id/years,
/models/:id/engines?year=. Each step's options load only after the prior step resolves. If the
Engine step's response has exactly one engine, skip rendering that step and proceed straight to
results using it. Store the resolved carEngineId in a small Zustand store or URL query state (your
call) so results (Task 3.2) and any "fits your car" PDP context (Design Decision 5) can reuse it
without re-running the wizard. Support both a compact "homepage widget" render mode and a
full-page render mode via a prop, per the design brief's "likely both" note.
```

### Task 3.2 — Fitment results page

**DoD:** Groups by category, handles 0/1/many products per category, distinguishes spec-only results
visually, matches the design brief's hot/cold climate side-by-side layout exactly.
**Prompt:**

```
Build app/[locale]/fitment/page.tsx (or a results section within the wizard, your call on
routing): once an engine is resolved, call GET /api/storefront/cars/engines/:id/fitment and
render results grouped by category (Engine Oil, Oil Filter, Air Filter, Cabin Filter, Fuel
Filter). Per category: if items have climate HOT and COLD, show them side-by-side with "For hot
climates" / "For cold climates" labels (not a fallback chain — both visible at once). If a
category has multiple STANDARD-climate items, show all as separate ProductCards, not just the
first. If an item has no product (spec-only), render a visually distinct card — not error-styled
— showing the specNote/specAttributes and a "We don't carry this yet — Request it" CTA that opens
the lead form (Task 3.3). Show the resolved car (brand/model/engine label) as a persistent
breadcrumb/header above the results so the customer knows what they're looking at.
```

### Task 3.3 — "Request it" lead form

**DoD:** Lightweight form per the design brief (name, phone, optional email/message); submits to
Phase 0's public route; shows a clear confirmation state, not a generic success toast.
**Prompt:**

```
Build components/storefront/fitment/RequestItModal.tsx (or inline panel): Name, Phone (required),
Email (optional), Message (optional, pre-filled with the spec context e.g. "Looking for: 5W-30,
API SP — Oil Filter for BMW X6 2006 (3.0si)"). Submits to POST
/api/storefront/fitment-inquiries with carEngineId/categoryId attached from context. On success,
replace the form with a clear "We got it — our team will reach out" confirmation, not just a
toast (design brief: "not a broken link, a graceful get-help path"). Client + server validation
aligned via a shared Zod schema.
```

### Task 3.4 — Homepage car-finder widget placement

**DoD:** Homepage renders the compact wizard prominently, per the design brief's "headline
interaction" framing.
**Prompt:**

```
Build app/[locale]/page.tsx (homepage): hero section with the FitmentWizard in compact mode
front-and-center ("Find parts for your car"), a secondary section linking to full category
browsing for customers who don't want to use the wizard, and a footer-adjacent trust/contact
strip pulling from Settings. Keep it mobile-first and uncluttered per the design brief's visual
constraints.
```

---

## Phase 4 — Category / Product Listing (PLP)

### Task 4.1 — PLP page

**DoD:** Filterable by category/brand/partType/filterKind, paginated, respects the optional
`?fit=<engineId>` car context from Task 3.1 by showing a "Shopping for: BMW X6 2006" banner with a
"change car" affordance.
**Prompt:**

```
Build app/[locale]/products/page.tsx: filter sidebar/bar (Category, Brand, Part Type/Filter
Kind, search), pagination, grid of ProductCards (Task 2.2), wired to GET
/api/storefront/products. If a ?fit= query param is present, show a dismissible banner with the
resolved car (fetch its label once) and a "change car" link back to the wizard — don't filter
the grid by fitment automatically unless that's an explicit toggle, since PLP is general
browsing and fitment results (Task 3.2) already handle the car-specific view.
```

### Task 4.2 — Category landing pages

**DoD:** Each active category with `showInFitmentFinder` or otherwise gets its own SEO-friendly
landing route, per the design brief's SEO priority.
**Prompt:**

```
Build app/[locale]/categories/[slug]/page.tsx: category hero (image, bilingual short
description), same filtered product grid as Task 4.1 pre-scoped to this category, and SEO
metadata (generateMetadata using the category's metaTitle/metaDescription pair for the active
locale). 404 on unknown/inactive slug.
```

---

## Phase 5 — Product Detail Page (PDP)

### Task 5.1 — PDP page

**DoD:** Shows the "fits your car" section when arriving with car context or when the product is
referenced by any Fitment Profile; OEM part number visible for search-driven arrivals.
**Prompt:**

```
Build app/[locale]/products/[slug]/page.tsx: image, bilingual name, PriceDisplay, StockBadge,
brand/category badges, long description, OEM part numbers (if any), Add to Cart control (Task
6.x dependency — stub the action if Cart isn't built yet, wire it once it is), and a "Compatible
vehicles" section if GET /api/storefront/products/:slug returns any linked car engines (from
Task 0.3) — list them grouped by model, not every individual engine row verbatim if that gets
long. SEO metadata from the product's metaTitle/metaDescription pair. 404 on unknown/inactive
slug.
```

---

## Phase 6 — Cart

### Task 6.1 — Cart store

**DoD:** Cart persists across page loads (localStorage) and reflects live stock status; quantity
can't exceed available stock.
**Prompt:**

```
Build lib/store/cart.ts (Zustand, persisted to localStorage): items (productId, snapshot of
name/price/image and addedAt timestamp, quantity), addItem, updateQuantity, removeItem, clear,
computed subtotal (client-side estimate only — see Task 8.2 for the authoritative server
recompute). On the cart page, re-fetch current stock/price for each line item and flag any that
changed (price changed since added, or now out of stock) — but per Design Decision 8, don't
resolve the price discrepancy client-side; just show a "price may update at checkout" notice.
The real price-hold check (was this addedAt within 24h of a logged price) happens server-side in
Task 8.2 against ProductPriceLog (Task 0.6).
```

### Task 6.2 — Cart page + mini-cart

**DoD:** Cart page and header mini-cart (Task 2.1) both reflect the same store; proceeding to
checkout is blocked while any line item is out of stock.
**Prompt:**

```
Build app/[locale]/cart/page.tsx: line items (image, name, price, quantity stepper, remove),
subtotal, stale-item warnings from Task 6.1, "Proceed to Checkout" CTA (disabled with an inline
message if any item is out of stock). Build a header mini-cart dropdown/drawer showing count +
subtotal + a link to the full cart page.
```

---

## Phase 7 — Authentication (Storefront)

### Task 7.1 — Register/Login pages

**DoD:** Reuses the same JWT/HTTP-only-cookie pattern as admin auth (per design brief Section 6),
not a separate auth system; CUSTOMER role only here (mirrors admin's ADMIN-only login rejection).
**Prompt:**

```
Implement app/api/storefront/auth/register (creates a User with role CUSTOMER; phone required +
unique, email optional, per Design Decision 7 / Task 0.6) and reuse/extend the existing
/api/auth/login, /logout, /me routes to accept CUSTOMER role logins by either phone or email
(currently admin-only and email-only per Task 2.2 of the admin doc — relax the role check there,
keeping ADMIN-only enforcement on the /admin/* middleware instead of the login route itself; add
an identifier-type detector so one login field accepts either a phone number or an email address).
Build app/[locale]/(account)/login and .../register pages: phone as the primary field (name +
password added for register), React Hook Form + Zod, HeroUI inputs, matching the
Top Oil.dc.html prototype's account screen layout/copy. Redirect to account/order history on
success.
```

### Task 7.2 — Storefront auth store + route guard

**DoD:** Mirrors the admin's Zustand auth store pattern; account pages redirect unauthenticated
visitors to login with a return path.
**Prompt:**

```
Extend/reuse lib/store/auth.ts for the storefront (or a parallel storefront-scoped store if you'd
rather not share admin/customer session state in one store — your call, document the choice).
Add middleware or a layout-level guard for app/[locale]/(account)/* routes requiring a logged-in
CUSTOMER, redirecting to login with a `from` param, mirroring Task 2.3 of the admin doc.
```

---

## Phase 8 — Checkout

### Task 8.1 — Resolve guest-checkout decision (blocks this phase)

**DoD:** Decision from Design Decision 6 is implemented — either `Order.customerId` becomes nullable
(schema migration) or guest checkout silently provisions a `User` row.
**Prompt:**

```
Implement whichever path the project owner chose for Design Decision 6:
(a) Nullable customerId: add a Prisma migration making Order.customerId optional, update the
    Orders admin UI (Task 10.x of the admin doc) to show "Guest" when null.
(b) Silent account: on guest checkout, create a User (role CUSTOMER, random unusable
    passwordHash, no login access) tied to the order's email, and offer a post-order "set a
    password to track this order" upsell — don't force it.
Document the choice in AGENTS.md so it's not re-litigated later.
```

### Task 8.2 — Checkout API

**DoD:** Server computes totals from live product data at order-creation time — cart-store prices are
never trusted directly, per the same snapshot principle as the admin doc's OrderItem design.
**Prompt:**

```
Implement POST /api/storefront/orders: accepts {items: [{productId, quantity, addedAt}],
shippingAddress, postalCode, contact info, deliveryMethod, (customerId if logged in)}. For each
item, resolve the price server-side per Design Decision 8: look up ProductPriceLog for the price
in effect at `addedAt`; honor it only if `addedAt` is within 24 hours of now, else use the
product's current price and flag that line as re-priced in the response so the UI can show it.
Re-fetch current stock (reject if any item now exceeds available stock), compute
subtotal/discount/shippingCost (from the two hardcoded delivery methods, Design Decision 10)/
total server-side (never trust client-submitted totals), creates the Order + OrderItems with
productNameSnapshot/priceSnapshot per the admin schema's existing fields, decrements
Inventory.stock accordingly, sets status PENDING / paymentStatus UNPAID. Integration-test
insufficient-stock rejection, the within-24h price-hold case, the expired-hold re-price case, and
the snapshot-correctness case.
```

### Task 8.3 — Checkout UI

**DoD:** Multi-step or single-page checkout (your call) collecting exactly the fields the schema
needs — no address-book UI per Design Decision in the design brief (no saved addresses yet).
**Prompt:**

```
Build app/[locale]/checkout/page.tsx: cart review, shipping address form (collected fresh every
order, not saved — per the design brief), contact info, order summary with computed totals, Place
Order button calling POST /api/storefront/orders. On success, clear the cart store and redirect
to an order confirmation page showing the snapshot data (not live product data), per the design
brief's "confirmation should show the snapshot" rule.
```

---

## Phase 9 — Account

### Task 9.1 — Order history + detail

**DoD:** Shows both fulfillment and payment status independently (an order can be Sending + Paid),
per the design brief.
**Prompt:**

```
Implement GET /api/storefront/orders (current user's orders only, from the auth cookie) and GET
/api/storefront/orders/:id (must belong to the requesting user — 403 otherwise). Build
app/[locale]/(account)/orders/page.tsx (list) and .../orders/[id]/page.tsx (detail: items w/
snapshot data, both status fields shown independently, shipping address). No "reorder" or address-
book features unless explicitly requested later.
```

### Task 9.2 — Account profile page

**DoD:** Minimal — name/email/phone edit only, since the schema doesn't model more yet.
**Prompt:**

```
Build app/[locale]/(account)/profile/page.tsx: view/edit name, email, phone (PATCH a new
/api/storefront/me route). Keep it small — don't add fields the schema doesn't have.
```

---

## Phase 10 — SEO Infrastructure

### Task 10.1 — Sitemaps + robots

**DoD:** Locale-aware sitemap covers products, categories, car brand/model/engine pages (per admin
Design Decision 7's "car pages are SEO pages"); respects the Settings sitemap toggle.
**Prompt:**

```
Implement app/sitemap.ts and app/robots.ts (Next.js conventions): sitemap entries for every
active product, category, car brand, and car model page, each in both /en/ and /fa/ variants,
only generated if GET /api/storefront/settings' sitemap toggle is on. robots.ts disallows
/checkout, /cart, /(account)/*, /api/*.
```

### Task 10.2 — hreflang + JSON-LD

**DoD:** Every locale-paired page links to its counterpart; PDP/category pages carry structured data.
**Prompt:**

```
Add hreflang alternate links (en/fa pairs, same slug per Design Decision 2) to every page's
generateMetadata. Add JSON-LD: Product schema on PDPs (name, price, availability from stock
status, brand), BreadcrumbList on PLP/PDP/category pages, Organization schema in the root layout
sourced from Settings.
```

### Task 10.3 — Car content pages (SEO-driven, per admin Design Decision 7)

**DoD:** Car brand/model pages rank as standalone content, not just wizard steps — matches the admin
schema already having bilingual name/description/meta fields on `CarModel`/`CarEngine` for this.
**Prompt:**

```
Build app/[locale]/cars/[brandSlug]/page.tsx and .../[brandSlug]/[modelSlug]/page.tsx: each
model page shows its bilingual description, a compact embedded fitment wizard pre-scoped to that
brand/model (skip the Brand/Model steps), and — where a FitmentProfile is broadly shared across
the model's year range — surface it as readable content (e.g. "Recommended oil for the 2006-2016
X6: ..."), not just buried in wizard results. SEO metadata from CarModel's meta fields.
```

---

## Phase 11 — Testing & Hardening

### Task 11.1 — E2E happy paths

**Prompt:**

```
Set up Playwright (reuse admin's config if Task 15.1 of the admin doc already added it). E2E
test: full car-finder flow (brand → model → year → engine, including a case where Engine step
auto-skips and a case where it doesn't) → results show a real product and a spec-only fallback
side by side → submit "Request it" → confirm it creates a FitmentInquiry (spot-check via admin
Inquiries screen). Separately: browse PLP → filter → open PDP → add to cart → checkout as guest
→ confirm order appears correctly in both storefront order history and admin Orders. Locale
switch preserves path and flips dir=rtl for /fa/.
```

### Task 11.2 — Security + performance pass

**Prompt:**

```
Audit: rate-limit fitment-inquiries and orders routes; confirm every /api/storefront/* route
excludes INACTIVE rows and never leaks admin-only fields (internalNote, adminNote, exact stock
counts if you chose to hide them in Task 0.3); confirm checkout server-recomputes totals and
never trusts client-submitted prices; run Lighthouse against Home/PLP/PDP and address any
LCP/CLS regressions from unoptimized images (use next/image throughout).
```

---

## Suggested execution order

Phase 0 first, always — nothing else has a real API to call without it. Task 0.6 is the one part
of Phase 0 that touches the admin codebase/schema (User, ProductPriceLog, StockNotification,
Product/Inventory routes) rather than adding purely new storefront-facing routes — do that one
yourself per your usual admin workflow, the rest of Phase 0 can go to Claude Code as-is.
Phase 1 (locale/RTL foundation) before Phase 2, since the shell depends on `[locale]` existing.
Phase 2 → 3 (wizard is the headline feature, build it once the shell exists).
Phase 4 → 5 (PLP → PDP) can happen in parallel with or right after Phase 3 — they share
ProductCard/PriceDisplay/StockBadge from Task 2.2.
Phase 6 (Cart) after Phase 5, since Add to Cart lives on the PDP.
Phase 7 (Auth) any time after Phase 1 — needed before Phase 9, optional before Phase 8 (guest
checkout).
Phase 8 (Checkout) after Phase 6 and after Design Decision 6 is resolved (Task 8.1).
Phase 9 (Account) after Phase 7 and 8.
Phase 10 (SEO) can start as early as Phase 4-5 exist and continue incrementally — don't save it
all for the end given it's the top business priority.
Phase 11 continuously, same discipline as the admin doc.
