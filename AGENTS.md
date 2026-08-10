# AGENTS.md

Read this before starting any task. It documents the conventions this repo follows
so that behavior stays consistent across many separate Claude Code sessions. See
`CLAUDE.md` for the fuller project brief (stack, principles, wireframe rules) and
`topoil-admin-claude-code-tasks.md` for the phased task list — work through it in
order, one task per session.

---

## Folder Structure

No `src/` prefix. Structure:

```
app/
  (auth)/
    login/              # public login route
  admin/                # protected route group — every admin screen lives here
  api/                  # Route Handlers, one folder per resource (e.g. api/admin/products/)
components/
  ui/                   # shared, generic primitives (buttons, inputs, pills) —
                         # no admin-specific or business logic here
  admin/                # admin-composed components (DataTable, form primitives,
                         # AdminShell, and other components built from `ui/` plus
                         # domain knowledge)
lib/                    # auth, db client, validation schemas (Zod), generic utils —
                         # framework-adjacent code with no JSX
server/                 # data access / service layer — route handlers call into
                         # here, never Prisma directly
types/                  # shared TypeScript types used in more than one place
prisma/
  schema.prisma
  prisma.config.ts
```

Don't create a new top-level folder unless a task genuinely needs one. Don't add
depth for its own sake — a flat, obvious structure beats a "correct" deep one.

---

## Naming Conventions

- **Components:** PascalCase, one component per file, filename matches the export
  (e.g. `DataTable.tsx`, `ProductForm.tsx`).
- **Functions & variables:** camelCase (`getCurrentUser`, `computeFinalPrice`).
- **Routes (URL segments / route folders):** kebab-case (e.g. `app/admin/order-items/`
  if such a route existed). Route group folders keep their parenthesized form,
  e.g. `(auth)`.
- **Types & interfaces:** PascalCase, no `I`/`T` prefix (`Product`, not `IProduct`).
- **Zod schemas:** camelCase with a `Schema` suffix (`productSchema`, `loginSchema`).
- **Files that aren't components** (utils, schemas, service modules): camelCase
  (`auth.ts`, `slugify.ts`) matching the primary export's purpose.
- **Bilingual model fields:** camelCase base name suffixed `En`/`Fa`
  (`nameEn`/`nameFa`, `shortDescriptionEn`/`shortDescriptionFa`,
  `metaTitleEn`/`metaTitleFa`). Never a generic `translations` blob, never a
  single field doing double duty for both languages.

---

## Shared Components — use them, don't rebuild them

- **Every list screen** is built on the shared `components/admin/DataTable`
  component. Don't hand-roll a table for a single module.
- **Every form** is built on the shared `components/admin/form/` primitives
  (`TextField`, `TextareaField`, `SelectField`, `TagsInput`, `ImageUploadField`,
  `ToggleField`, `BilingualTextField`, `BilingualTextareaField`, `FormActions`).
  Don't hand-roll form fields, duplicate validation-error styling, or build a
  one-off pair of `TextField`s for an En/Fa field — use `BilingualTextField`/
  `BilingualTextareaField` every time a bilingual pair is edited.
- If a screen's needs don't fit the shared component, extend the shared
  component — don't fork it into a one-off.

### `components/admin/DataTable`

Generic, module-agnostic list table built on HeroUI's `Table`/`Select`/
`SearchField`/`Pagination` primitives. Nothing product/order/category-specific
lives in this file — module screens pass columns and data in as props. Demo
usage with mock data: `app/dev-preview/DataTableDemo.tsx` (rendered from
`app/dev-preview/page.tsx`).

```ts
interface DataTableColumn<T> {
  key: keyof T & string; // column also used as the default cell value lookup
  label: string; // header text
  render?: (row: T) => ReactNode; // optional custom cell renderer (e.g. StatusPill, formatted price)
}

interface DataTableFilter {
  label: string; // shown as the "All" option and the select's placeholder text
  value: string; // "" means no filter applied ("All")
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}

interface DataTableProps<T extends { id: string }> {
  columns: DataTableColumn<T>[];
  rows: T[]; // already-paginated rows for the current page
  searchPlaceholder?: string;
  onSearch?: (query: string) => void; // debounced, fires searchDebounceMs after typing stops
  searchDebounceMs?: number; // default 300
  filters?: DataTableFilter[]; // renders one Select per filter, next to the search box
  page: number; // 1-indexed current page
  pageSize: number;
  total: number; // total row count across all pages (drives pagination + summary text)
  onPageChange: (page: number) => void;
  emptyMessage?: string; // default "No results found."
  "aria-label": string; // required, accessible name for the underlying table
}
```

`DataTable` is presentation-only — it does not fetch, filter, or paginate
data itself. The caller (a Server Component fetching from the API, or a
client wrapper managing local state) owns `rows`/`total`/`page` and passes
already-sliced data in.

Also exported: `StatusPill({ value: string })` — renders a colored HeroUI
`Chip` pill. Use it as a column's `render` fn for any status-like field.
Color mapping (case/whitespace-insensitive match on `value`):

| Color              | Statuses                                    |
| ------------------ | ------------------------------------------- |
| green (`success`)  | Active, In Stock, Delivered, Paid, Resolved |
| red (`danger`)     | Inactive, Out of Stock, Cancelled           |
| orange (`warning`) | Pending, Low Stock, New                     |
| blue (`accent`)    | Sending, Sent, Contacted                    |

Unrecognized status strings fall back to the neutral `default` chip color
rather than throwing — extend `STATUS_PILL_COLOR` in `DataTable.tsx` if a
new status value needs a mapping (e.g. if Fitment Recommendation priority
states or a future status get added).

### `components/admin/form/`

Each field wraps React Hook Form's `Controller` (or `useController` directly,
for fields that need local state alongside the bound value) + a HeroUI
component + `FieldError`/inline error text. Label above, input below, red
error text under invalid fields — consistent across every form in the app.
Demo usage: `app/dev-preview/FormFieldsDemo.tsx` (rendered from
`app/dev-preview/page.tsx`).

All fields take `control: Control<TFieldValues>` and `name: FieldPath<TFieldValues>`
plus a `label`, so wiring one into a `react-hook-form` + Zod form is the same
shape regardless of field type:

- **`TextField`** — `type`, `placeholder`, `isRequired`.
- **`TextareaField`** — `placeholder`, `rows`, `isRequired`.
- **`SelectField`** — `options: { label, value }[]`, `placeholder`, `isRequired`.
- **`TagsInput`** — value is `string[]`; type + Enter (or comma) to add a tag,
  Backspace on an empty draft removes the last tag, each tag renders as a
  removable pill.
- **`ImageUploadField`** — value is `File | string | null` (a `File` for a
  newly picked upload, a `string` URL when editing an existing image);
  renders an object-URL preview for `File` values and revokes it on
  change/unmount.
- **`ToggleField`** — value is `boolean`; no `isRequired` (a switch is either
  on or off).
- **`BilingualTextField`** — takes two `name`s (e.g. `nameEn`/`nameFa`) instead
  of one; renders two stacked `TextField`-equivalents labeled "English" /
  "فارسی", with the Persian input given `dir="rtl"`. Use this — never two
  independent `TextField`s — for any field that has an En/Fa pair.
- **`BilingualTextareaField`** — same pairing pattern as `BilingualTextField`,
  for the description/meta-description fields.
- **`FormActions`** — not field-bound; takes `onCancel`, `isSubmitting`,
  and optional `saveLabel`/`cancelLabel`, renders Save (primary) + Cancel
  (outline).

### `components/storefront/`

The customer-facing counterpart to `components/admin/`: the shell (`StorefrontShell`,
`StorefrontHeader`, `StorefrontFooter`, `LocaleSwitcher`, `MiniCart`, `AccountLink`,
`MobileNavDrawer`) plus the catalog primitives below, which the PLP, the category
landing pages, the PDP, the fitment results and the cart all build on. Don't
hand-roll a product tile, a price line or a stock chip — every screen that shows
a product shows the same ones. Demo usage in both language trees:
`app/[locale]/dev-preview/` (development only — the page 404s in production).

Every one of them takes `locale` explicitly rather than calling `useLocale()`, so
a Server Component can render them straight from its `params`.

- **`ProductCard`** — `locale`, `product`, and four optional props: `href`
  (defaults to `/{locale}/products/{slug}`), `fitsRibbon` (the "fits your car"
  slot, rendered over the image's trailing corner), `onAddToCart`, and
  `imageSizes`. `product` is a plain `ProductCardProduct` shape
  (`id`/`slug`/`nameEn`/`nameFa`/`image`/`price`/`finalPrice`/`stockStatus`/`brand?`),
  structurally satisfied by the API's `StorefrontProductCard` but not tied to it,
  so fitment results and rails can feed it too. Both names are rendered — the
  reader's first, the other language's underneath — because shoppers search in
  both scripts.
  - **Add to cart** writes to the `lib/store/cart` Zustand store by default,
    capturing `finalPrice` as the displayed price. That default is what keeps the
    card renderable from a Server Component; pass `onAddToCart` to intercept it.
  - **Out of stock** swaps the CTA for the ghost "Notify me" button and discloses
    `NotifyMeForm` inline (Design Decision 9) instead of disabling the card.
  - **`ProductCardSkeleton`** (same module) is the loading state: identical box
    sizes, neutral blocks, deliberately no pulse animation.
- **`PriceDisplay`** — `locale`, `price` (list), `finalPrice` (charged),
  `size` (`sm` card / `lg` PDP). The only place that decides whether a product
  reads as discounted; never compare the two numbers at a call site.
- **`StockBadge`** — `locale`, `status`, `variant` (`inline` dot+label on a card,
  `pill` chip on the PDP). Three states and no number: the API sends
  `OUT_OF_STOCK`, `LOW_STOCK`, or `null` for "plenty", and the exact count never
  leaves the admin panel.
- **`Breadcrumbs`** — `locale` and `items: { label, href? }[]`. Labels arrive
  already localized; the last crumb renders as the current page, never a link,
  and the chevron flips with the locale.
- **`NotifyMeForm`** — `locale`, `productRef` (id or slug), `autoFocus`. One
  field, React Hook Form + `stockNotificationCreateSchema`, POSTing to
  `/api/storefront/products/:ref/notify-me`. It owns its own request rather than
  taking an `onSubmit` — there is one endpoint and one shape. Validation copy is
  localized in the component because the shared schema's messages also serve the
  API and are English-only.
- **`ProductFilters`** — the PLP's filter rail: `locale`, `basePath`, `params`
  (`ProductListParams`), and pre-localized `categories`/`brands` option lists.
  It holds no filter state — every control writes the next URL and the server
  re-renders — so the only `useState` in it is whether the rail is open on a
  phone. Options arrive already localized so the catalog's types (and Prisma)
  stay out of the browser bundle. The Filter-kind select appears under
  `partType = FILTER`, and also whenever a kind is already applied, so a
  hand-edited URL can't filter the grid with no control to undo it.
- **`ProductSortSelect`** — the same contract, split out because sort sits above
  the grid rather than in the rail: it changes the order, not which products
  are shown. Both it and `ProductFilters` reset to page 1 on any change.
- **`Pagination`** — `locale`, `page`, `pageCount`, and `hrefForPage(page)`.
  Real links, not buttons: page 2 is only crawlable if it has a URL. The caller
  owns what a page's href looks like (it holds the filters); this owns which
  pages are offered, via `paginationRange`. Renders nothing at one page or
  fewer, and the disabled ends are spans so there is nothing to focus.
- **`FitContextBanner`** — "Shopping for: Peugeot 206 · 1.4L TU3 Petrol
  (2001–2010)", the car carried into general browsing by `?fit=`. It is
  context, not a filter — the catalog underneath stays whole — so it offers the
  car-specific view (`See parts that fit`), a different car (`Change car`), and
  a dismiss. **Dismissing is a link to the same page without `?fit=`**, not
  client state: the context lives in the URL, and hiding the banner while every
  link still carried the car would be a lie the next page tells.

### `components/storefront/pdp/`

The product page's own three pieces. Everything else on it — `PriceDisplay`,
`StockBadge`, `Breadcrumbs`, `NotifyMeForm` — is the shared set above.

- **`AddToCartControl`** (client) — `locale`, `product` (a `NewCartItem`),
  `outOfStock`. The same store write `ProductCard` does, with a quantity in
  front of it: a grid tile only has room to ask for one, the product page is
  where someone decides on four. Out of stock renders `NotifyMeForm` outright
  rather than behind the card's toggle — the page has the room, and a customer
  who came this far has already shown the interest the toggle asks about. Its
  quantity cap is a stray-keypress guard, not a stock limit: exact stock never
  leaves the admin panel, so the real check is the cart's (Task 6.1).
- **`FitsYourCarNotice`** — the verdict for a customer who arrived with `?fit=`,
  sitting next to the buy button. **Neither state says "incompatible."** A
  product appears in a car's fitment because a profile recommends it; the
  absence of that link means we haven't matched it, which is a weaker claim than
  "it won't fit" and the only one the catalog can support.
- **`CompatibleVehicles`** — "this fits: Peugeot 206 (2001–2010), …", one row
  per **model**, not per engine (`groupFittingEnginesByModel`). Past six rows
  the rest go behind a native `<details>` — still in the HTML, so a crawler
  reads the whole list — and the `?fit=` car's row is floated to the top and
  tagged, because that's the one row the customer came for.

### `components/storefront/account/`

The `/[locale]/login` and `/[locale]/register` screens' pieces, plus the header's
account affordance.

- **`AuthCard`** — the two-tab pill switcher over a titled form that both auth
  screens are built on. The tabs are `Link`s to two real routes, not client
  state over one, and they carry the guard's `from` param across the switch.
- **`AccountLoginForm`** / **`AccountRegisterForm`** — `locale` plus an optional
  `from`. Both take `from` as a prop from the page's `searchParams` rather than
  reading `useSearchParams()`, so neither needs a Suspense boundary, and both
  route the value through `accountReturnPath` instead of trusting it.
- **`AccountLink`** — the header pill: "Account" → `/[locale]/orders` for a
  signed-in CUSTOMER, "Sign in" → `/[locale]/login` otherwise. The storefront's
  one reader of the session store below; sign-out lives on the orders screen.

### `components/storefront/fitment/`

The car-finder. **`FitmentWizard`** takes `locale`, `mode` (`full` stepper /
`compact` homepage widget) and an optional `onResolve`; `useFitmentWizard` holds
the Brand → Model → Year → Engine cascade over the four
`/api/storefront/cars/*` list routes so the component stays a rendering of four
steps. Neither mode renders a heading — the page that mounts it owns its own
copy.

- **A resolved car goes in the URL, not a store.** Resolving pushes
  `/{locale}/fitment?fit=<carEngineId>` (`withFitContext` in
  `lib/storefront/fitment.ts`), which is what the results page, the PLP banner
  and the PDP's "fits your car" line read (Design Decision 5) — so a customer's
  car is shareable and survives a reload. The in-progress selections stay local
  state: nobody links to a half-answered wizard.
- **One matching engine skips the Engine step entirely** and resolves on the
  year pick. The step is rendered (disabled) until the engine list loads,
  because before a year is chosen there's no way to know whether it's needed.
- Each step's options are stored under the input they were loaded for, so
  changing the brand makes the model list read as empty rather than needing a
  reset — that's what keeps the cascade out of effect bodies and the React
  Compiler's `set-state-in-effect` rule satisfied.

**`FitmentResults`** renders what the wizard resolved: `locale`, `car`
(`CarEngineContext`) and `groups` (`FitmentCategoryGroup[]`), straight off
`lib/services/fitment`. It has no `"use client"` — a Server Component renders
the whole tree and only the interactive leaves ship to the browser.

- **Categories are ordered here, not by the query.** `sortFitmentGroups` ranks
  on `partType`/`filterKind` (engine oil, then oil/air/cabin/fuel filters) —
  the service returns whatever order the admin entered items in. Never rank on
  a category name.
- **HOT/COLD is a pair, not a fallback chain.** `splitItemsByClimate` puts them
  in two labelled columns visible at once ("For hot climates" / "For cold
  climates"); a category's STANDARD items render below in their own grid, all
  of them, because two acceptable filter brands are co-equal options.
- **`SpecOnlyCard`** is the other half of a result: the item has no product, so
  it renders the `specNote`/`specAttributes` we do know plus the "Request it"
  disclosure. Informational styling, never error styling. `categoryName: null`
  is the whole-car case (an engine with no fitment profile), which reuses the
  same card so a customer is never left at a dead end.
- **`RequestItForm`** is what that disclosure opens: name and phone required,
  email and message optional, the message pre-filled from
  `buildFitmentRequestMessage` so the customer isn't asked to describe a spec
  we already know. It POSTs to `/api/storefront/fitment-inquiries` and validates
  with `storefrontFitmentInquiryCreateSchema` — the same schema that route runs,
  so the client can't send something the server then rejects. `carEngineId` and
  `categoryId` are default values rather than rendered fields: context the
  customer never types, but part of the payload the schema checks. On success
  the form is _replaced_ by a confirmation panel that says who will call and
  when, and `onSubmitted` tells the card to drop its toggle — a disclosure that
  could be collapsed would throw that confirmation away.

`app/[locale]/fitment/page.tsx` is both states of that screen, told apart by
`?fit=`: no car means the wizard, a resolved car means its results. It reads
through `lib/services/fitment` directly rather than fetching its own
`/api/storefront/...` route — same functions that route serves, rendered on the
server (the pattern `app/[locale]/layout.tsx` uses for Settings).

### `lib/storefront/pricing.ts`

Price formatting and discount maths, shared by the components above and by
anything else that prints money. `formatNumber`/`formatToman` render Persian
digits and the ٬ separator on the `fa` tree via `Intl` (currency is Toman
everywhere). `getDiscountPercent` returns a whole percent and is the single test
for "is this discounted" — a discount that rounds to 0% is not one, which is what
keeps the strikethrough and the "−15%" badge from disagreeing.

### `lib/storefront/plp.ts`

The product listing's shared vocabulary — the PLP has no store and no state
hook, because its filters, sort and page all live in the query string. That is
what lets the grid render on the server and a filtered view stay linkable and
crawlable, with only the controls that write the next URL shipping to the
browser.

- **`buildProductListHref(basePath, params)`** is the only place a PLP URL is
  spelled. Params are written in a fixed order and anything at its default is
  omitted, so one set of filters is always exactly one URL — two spellings of
  the same view would split its crawl budget for nothing.
- **`partTypeLabel`/`filterKindLabel`** render the fitment engine's identifiers
  for a customer. Never show a raw enum, and never let a category's name stand
  in for its part type — several categories share one.
- `PLP_PAGE_SIZE` is the screen's decision, not the URL's: unlike the API's
  query schema, `storefrontProductListPageQuerySchema` has no `pageSize` field.
  That schema is the page's counterpart to the route handler's — same params,
  but each field falls back on its own (`.catch`), because a page can't answer
  `?page=abc` with a 400 and one bad param shouldn't silently clear the
  customer's other filters.

`app/[locale]/products/page.tsx` composes those with the primitives above, and
reads through `lib/services/catalog` directly rather than fetching its own
`GET /api/storefront/products` — same pattern as the fitment page. **`?fit=` is
carried, never applied**: the car rides along in the banner and in every link
the customer follows (so the PDP can say "fits your car"), but the grid stays
the full catalog. Narrowing to one car is what the fitment results page is for,
and silently hiding products here would look like an empty shop.

### `lib/storefront/pdp.ts` and `lib/storefront/seo.ts`

`groupFittingEnginesByModel` turns the catalog's flat "fits these car engines"
list into the PDP's vehicle rows. One row per engine is what the service
returns and it is not what a customer needs: three trims of a 206 across four
year ranges is one fact, "the 206". A group's span opens up (`yearEnd: null`) if
**any** of its engines is still in production, and the service's brand → model →
year order is preserved rather than re-sorted here.

`firstFilled(...values)` is the fallback every `generateMetadata` on the
storefront runs: the admin's meta fields are optional and an untouched one
reaches the database as `""`, so it's a trim check, and it returns `undefined`
so Next omits the tag rather than emitting an empty one.

`app/[locale]/products/[slug]/page.tsx` composes both. The slug is the whole
canonical URL — `?fit=` is context alongside it, never part of it (Design
Decision 5) — and it carries that context onward into every link out of the
page, the same way the PLP handed it in.

---

## Storefront locale — `lib/i18n/`

The admin panel is English/LTR only; the locale rules below apply to the
storefront tree (`app/[locale]/`) and anything it renders.

- **`pickLocale(locale, en, fa)`** is the only way a bilingual `xEn`/`xFa` pair
  is rendered. It returns `fa` on the Persian tree when `fa` is non-empty
  (whitespace-only counts as empty), and `en` otherwise — Persian content will
  lag English for a while, and an untranslated field must show English, not a
  blank. Never hand-roll `locale === "fa" ? nameFa : nameEn`; that skips the
  fallback. `BilingualTextField` edits a pair, `pickLocale` renders one.
- **`useLocale()`** (`@/lib/i18n/useLocale`) reads the current `[locale]`
  segment from a Client Component. Server Components already get it from
  `params` — use that instead of threading a prop down. Imported from its own
  module, not the `lib/i18n` barrel, so `"use client"` doesn't leak into server
  graphs.
- **`formatDigits(value, locale)`** renders a number that is a label rather than
  a quantity — a model year, a step number — in the reader's digits with no
  grouping. Grouping would print 2006 as "۲٬۰۰۶", which reads as a price;
  `formatNumber` in `lib/storefront/pricing.ts` is the one that groups.
  `NUMBER_LOCALE` (the BCP-47 tag per tree) backs both.
- `LOCALES` / `Locale` / `isLocale` / `localeDir` / `localeFromSetting` are the
  routing primitives. Note the case split: the URL segment is lowercase
  (`"en"`), the stored Settings value is uppercase (`"EN"`), and
  `localeFromSetting` is the only bridge.

---

## Session — `lib/store/auth.ts` and the account guard

**The admin panel and the storefront share one session store**, not one each.
There is a single JWT in a single HTTP-only cookie read back through a single
`/api/auth/me` (design brief Section 6), so a second store would be a second
mirror of the same source of truth, free to disagree with the first inside one
tab. `user.role` is what tells the two surfaces apart. Consequences worth
knowing:

- `logout(redirectTo)` takes its destination — `/login` from the admin chrome,
  that locale's tree from the storefront. The store knows no route names.
- The store hydrates in the browser, not from server props: `app/[locale]/layout.tsx`
  is cached (`revalidate = 300`), so rendering the signed-in customer into the
  shell would serve one customer's name to everyone. Anything session-dependent
  in the storefront chrome is therefore a Client Component reading this store.
- The auth forms call `setUser` on success. Hydration only runs on a page load,
  so without it the header would still say "Sign in" after a client-side
  navigation away from the form.

**`proxy.ts` guards both trees**, `/admin/*` for ADMIN and the account screens
for CUSTOMER, redirecting to the right login with `from` set to the path _and_
query it turned away. Two rules keep it honest:

- The protected paths come from `PROTECTED_ACCOUNT_PATHS` in
  `components/storefront/nav-items.ts`, not from the `(account)` route group —
  `/login` and `/register` sit in that group and must stay public. Next needs
  `config.matcher` to be statically analyzable, so it spells out the
  locale-prefixed form of each; **adding an account screen means adding it in
  both places.**
- The edge has no Prisma, so the proxy only verifies the JWT — whether that user
  still exists and is ACTIVE is re-checked by `getCurrentUser()` inside the
  route handlers. The guard is routing convenience, not the security boundary.

An ADMIN is turned away from the account screens too, and `AccountLoginForm`
drops an admin's session with an error rather than letting it stand — the mirror
of the admin login form's CUSTOMER rejection, and what stops form and guard from
bouncing a signed-in admin between each other forever.

---

## List search — `lib/search.ts`

**Every list service builds its search clause the same way**, and it is not a
bare `contains: query.search`. That naive form silently fails whenever what the
admin typed isn't stored in one column exactly as typed — "Sara Ahmadi" against
`firstName`/`lastName`, "Peugeot 206" against `carBrand.nameEn` +
`carModel.nameEn`, "Mobil 5W-30" against a product actually named "Mobil 1
5W-30". All three matched nothing.

The shape to copy, using `searchTokens` and `contains` from `lib/search.ts`:

```ts
const where: Prisma.UserWhereInput = {
  role: "CUSTOMER",
  ...(query.status ? { status: query.status } : {}),
  AND: searchTokens(query.search).map((token) => ({
    OR: [{ firstName: contains(token) }, { lastName: contains(token) }],
  })),
};
```

- **No conditional spread is needed.** `searchTokens` returns `[]` for an
  absent or blank query and Prisma treats `AND: []` as no constraint, so the
  empty case falls out for free.
- **Every token must match at least one column, and tokens may match different
  columns.** A single-word query behaves exactly as it did before this existed.
- **`contains(token)` exists for the `as const` on `mode`.** These clauses are
  built inside a `.map`, so TypeScript infers the callback's return type before
  checking it against Prisma's where-input, and a bare `"insensitive"` widens
  to `string`.
- **Where the service already has an `AND` array** (`listSearchableCarEngines`),
  spread the tokens into it rather than adding a second `AND` key.
- **Array columns are the one exception.** `oemPartNumbers` matches with `has`,
  which is exact rather than substring, so an OEM code containing a space would
  never survive tokenisation — `listProducts` and the storefront catalog search
  therefore also try the raw query whole, OR'd against the tokenised branch.

---

## Guest orders — Design Decision 6, settled

**A guest checkout creates an order, never an account.** `Order.customerId` is
nullable, and `guestName` / `guestPhone` / `guestEmail` on the order row carry
the contact details the checkout form collected. Exactly one side is ever
populated. Don't re-litigate this: the rejected alternative — silently creating
a CUSTOMER `User` per guest order — needs a junk `passwordHash` that can never
log in, fills the admin Customers list with unreachable rows, and collides with
the unique `phone` constraint (Design Decision 7) the second time a guest
orders. A guest who later registers gets a normal account; the earlier order
stays a guest order rather than being retroactively claimed.

Consequences worth knowing:

- **`onDelete: Restrict` is spelled out on the relation** even though it's the
  behavior a required relation already had. Prisma's default for an _optional_
  relation is `SET NULL`, which would turn a deleted customer's order into
  something indistinguishable from a guest order.
- **`server/order.ts` owns the name resolution**, not the call sites.
  `orderContactName` reads the account name, falls back to `guestName`, then to
  the literal `"Guest"`; nothing enforces `guestName` at the database level.
  `toOrderListItem` and `getOrderById` both return `isGuest` so the admin
  screens can tag the row without re-deriving it from a null check.
- **`getOrderById` returns one normalized contact block** — `{ id, name, email,
phone, isGuest }`, with `id: null` for a guest — so the detail screen renders
  the Customer card the same way either way rather than branching on which shape
  arrived.
- **Order search covers the guest columns too.** A guest order has no `customer`
  relation to match against, so searching only the relation would make it
  unreachable from the Orders screen's Customer search box.

---

## Checkout money — `createStorefrontOrder` in `server/order.ts`

**Nothing about money comes from the client.** `storefrontOrderCreateSchema` has
no price field, no totals and no `customerId`: quantities, `addedAt` and the
delivery method are the only inputs, every price is resolved server-side, and
who is ordering comes from the auth cookie. Zod strips anything else the body
carries, so a tampered payload has nothing to tamper with.

- **The 24-hour price hold (Design Decision 8) is a lookup, not a promise the
  browser holds.** `priceInEffectAt` reads the latest `ProductPriceLog` row at
  or before the line's `addedAt` — a row records the price a change moved _to_,
  so the latest one that had already happened is what was live then. No row
  means the cart predates the product's first recorded change and the current
  price stands. `isPriceHoldActive` (`lib/storefront/cart.ts`) decides whether
  that looked-up price still applies; a future `addedAt` gets no hold, so a
  skewed clock can only fall through to the current price.
- **The hold caps the price, it never raises it.** Inside the window the
  customer is charged the _cheaper_ of the held and current prices. The cart
  screen shows the live price, so honouring a higher held one would charge more
  than the number they were looking at. Either way the response flags the line
  with `repriced` + `previousUnitPrice` so checkout can say what changed.
- **`subtotal` is gross and `discount` is what the product discounts took off**,
  which makes `subtotal - discount` the sum of the line totals and keeps the
  admin Totals card adding up top to bottom. The list price and the charged
  price always come from the _same_ quote — mixing a held final price with a
  current list price would put the two columns out of step.
- **`tax` is 0 on purpose.** VAT (9%) is included in every price shown and
  charged, not added on top (design brief), so the storefront renders it as an
  informational line and there is nothing to add to the total. Storing the
  included portion would break the admin card's
  `subtotal − discount + shipping + tax = total` reading.
- **`deliveryMethod` isn't stored** — the schema keeps the `shippingCost` it
  produced, not which button was pressed. Rates live in
  `lib/storefront/delivery.ts` as flat constants (Design Decision 10); the
  labels and ETAs are locale copy and belong to the checkout screen.
- **Stock is re-checked twice.** Once up front, so every bad line can be
  reported at once, and again inside the transaction as `stock >= quantity` in
  the `updateMany` WHERE — that's what stops two simultaneous checkouts both
  taking the last unit. A miss throws `CheckoutRejectedError` and rolls the
  whole order back; the route answers **409, not 400**, because the payload was
  fine and the catalog moved underneath it.

---

## Everything else

Tech stack, architectural principles, TypeScript/React/API/auth rules, styling,
and wireframe rules live in `CLAUDE.md` — this file only covers structure and
naming so it doesn't drift out of sync with that fuller document.
