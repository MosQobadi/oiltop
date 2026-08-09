# CLAUDE.md

## Project

Top Oil — admin panel for an e-commerce platform selling engine oils and filters.
Admin area only for now (no customer-facing storefront yet). The feature that
sets this app apart from a generic catalog admin is Cars & Fitment: matching a
customer's car (brand → model → year → engine) to the right products
(engine oil — sometimes a HOT and a COLD variant — plus Oil/Air/Cabin/Fuel
filters), with a spec-only fallback and lead-capture (Fitment Inquiries) when
no catalog product matches yet.

Built wireframe-first where a wireframe exists: `top-oil.excalidraw` (Technotopia's
own 15 admin frames — Login, Dashboard, Products, Categories, Brands, Orders,
Inventory, Customers, Settings — reused as-is, rebrand only) plus
`topoil-admin-new-frames.excalidraw` (Car Brands - List / Add-Edit, drawn fresh
in the same visual style). See `topoil-admin-claude-code-tasks.md` for the
phased build order — work through it one task per session, don't jump ahead.

## Core Principles

- Prefer simplicity over abstraction.
- Avoid over-engineering.
- Every folder and file must have a clear purpose.
- Keep code easy to understand for a solo developer.
- Optimize for maintainability over cleverness.
- If functionality is unclear, ask instead of assuming.

---

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript (strict)
- Tailwind CSS
- HeroUI
- Zustand
- PostgreSQL
- Prisma 7 — requires a driver adapter (`@prisma/adapter-pg`); there is no
  built-in query engine anymore. Connection config lives in `prisma.config.ts`,
  not just `.env`.
- React Hook Form + Zod
- JWT + bcryptjs + HTTP-only cookies (auth)
- Next.js Route Handlers (REST) for the API layer
- date-fns
- pnpm
- Docker + Docker Compose + Nginx + Ubuntu VPS (deployment — see `DEPLOYMENT.md`
  once Phase 16 of the task list is reached; not a concern for day-to-day feature work)

No i18n library in the admin panel itself. The admin UI stays English/LTR;
bilingual content (En/Fa) lives in the data model as field pairs and is edited
via `BilingualTextField`/`BilingualTextareaField` (see `AGENTS.md`). A locale-
routed, RTL-aware storefront is a separate future phase, not part of this stack
list yet.

---

## Folder Structure

Use this structure unless there's a strong reason not to. No `src/` prefix.

```
app/
  (admin)/              # root layout for the admin tree (English/LTR, always)
    (auth)/login/
    admin/              # protected route group — every admin screen lives here
    dev-preview/
  [locale]/             # root layout for the storefront (lang/dir per locale)
  api/admin/            # Route Handlers, one folder per resource
  api/storefront/       # unauthenticated public counterparts
components/
  ui/                   # shared primitives (buttons, inputs, pills)
  admin/                 # composed admin components (DataTable, Form fields, AdminShell)
lib/                    # auth, db client, validation schemas, generic utils
server/                 # service/data-access layer — route handlers call into here, not Prisma directly
types/
prisma/
  schema.prisma
  prisma.config.ts
```

There is deliberately **no `app/layout.tsx`**. `(admin)/layout.tsx` and `[locale]/layout.tsx` are
two independent root layouts, each rendering its own `<html>` — that's the only way the storefront
can set `lang`/`dir` per locale while the admin stays English/LTR. Don't reintroduce a shared root
layout; it would make the nested `<html>` invalid.

Do not create unnecessary layers. If a task doesn't need a new top-level folder, don't add one.

---

## TypeScript Rules

- Strict mode enabled.
- Avoid `any`.
- Prefer explicit types over inferred-and-hoped-for.
- Extract reusable types to `types/` when used in more than one place; otherwise keep them next to usage.

---

## React Rules

- Prefer Server Components. Use Client Components only when interactivity requires it
  (forms, modals, anything with `useState`/`onClick`).
- Keep components small and focused — one screen's worth of composition should read
  like an outline, not a wall of JSX.
- Avoid prop drilling when Zustand is the better fit (see State Management).
- Every list screen is built on the shared `components/admin/DataTable`. Every form
  screen is built on the shared `components/admin/form/*` primitives, including
  `BilingualTextField`/`BilingualTextareaField` for any En/Fa field pair. Don't build
  a bespoke table or form when the shared one covers it — extend the shared component
  instead.

---

## State Management

- Zustand for client global state (auth session, anything genuinely cross-cutting).
- Server Components for server state — fetch there, pass down as props.
- Avoid unnecessary global stores. Local `useState` first; Zustand only when state
  needs to survive across routes/components that aren't parent-child.

---

## Forms

- React Hook Form + Zod (`zodResolver`) for every form, no exceptions.
- Validate on both client (immediate feedback) and server (never trust the client).
- Reuse the shared field components (`TextField`, `SelectField`, `TagsInput`,
  `ImageUploadField`, `ToggleField`, `TextareaField`, `BilingualTextField`,
  `BilingualTextareaField`) — see `components/admin/form/`.

---

## Database

- Prisma 7 with `@prisma/adapter-pg` — `PrismaClient` requires the adapter passed in
  at construction; `new PrismaClient()` with no adapter will throw.
- Schema lives at `prisma/schema.prisma`; connection config in `prisma.config.ts`.
- Every model: `id` (cuid), `createdAt`, `updatedAt`.
- Proper relations, not loose foreign-key-shaped strings.
- Soft delete / deactivate where a hard delete would orphan history or break a
  reference: products with order history or active Fitment Profile items get
  deactivated, not deleted; categories/brands/car models/car engines with children
  block delete with a clear error rather than orphaning them; a Fitment Profile
  blocks delete while still linked to any car engine (detach first).
- Bilingual text fields are column pairs (`nameEn`/`nameFa`, etc.), never a JSON
  blob or a separate translations table — see `AGENTS.md` for the naming convention.
  `FitmentProfile.label` is the one deliberate exception: it's an internal
  admin-only identifier, never shown to a customer, so it's a single field, not
  a bilingual pair.
- `Category.partType` (`ENGINE_OIL` / `FILTER` / `ACCESSORY` / `OTHER`) and
  `Category.filterKind` (`OIL_FILTER` / `AIR_FILTER` / `CABIN_FILTER` / `FUEL_FILTER`,
  set only when `partType = FILTER`) are how the fitment engine identifies a
  category — never match on `nameEn`/`nameFa` strings for logic, only for display.
- `FitmentProfileItem.climate` (`STANDARD` / `HOT` / `COLD`) must be `STANDARD`
  unless the related category's `partType` is `ENGINE_OIL` — this is a Zod
  cross-field rule (see `lib/validation/`), not a database constraint, so it can
  be relaxed later without a migration if a non-oil category ever needs it.
- Fitment is never modeled directly on `CarEngine`. A recommendation is a
  `FitmentProfile` (a reusable set of `FitmentProfileItem`s) attached to one or
  more engines via `CarEngineFitmentProfile` — this is what lets one profile
  cover many engines (e.g. multiple trims/years of the same car) without
  re-entering it per engine. Don't add fields to `CarEngine` that duplicate
  what belongs on the profile.
- Any schema change: update `schema.prisma` and the migration together, then run
  `pnpm prisma generate`.

---

## API Rules

- Route Handlers under `app/api/admin/<resource>/route.ts` are the standard pattern
  for this project — this is a deliberate choice, not a default; don't switch to
  Server Actions for admin CRUD without discussing it first.
- Route handlers stay thin: parse + validate the request (Zod), call into `server/`
  for the actual logic, shape the response. No Prisma calls directly inside a route
  handler.
- Every response follows `{ success: true, data }` or `{ success: false, error }`.
- Validate every input with Zod — path params, query params, and body.

---

## Authentication & Security

- JWT signed on login, stored in an HTTP-only, Secure (production), SameSite=Lax cookie.
  `bcryptjs` for password hashing.
- Next.js 16 renamed `middleware.ts` to `proxy.ts` — use `proxy.ts` for route
  protection (redirect unauthenticated/non-admin requests away from `/admin/*`).
- **Don't rely on `proxy.ts` alone for auth.** It's a routing-layer convenience, not
  a security boundary by itself — verify the JWT and role again inside every
  route handler / server action that touches admin data. Defense in depth, not
  duplicated trust.
- Never trust client-supplied data — re-validate everything server-side even if the
  client already validated it.
- Secrets in environment variables only. Never hardcoded, never logged.

---

## Styling

- Tailwind CSS + HeroUI components.
- Mobile-first, consistent spacing scale.
- Keep layouts clean and minimal — favor whitespace over dense data-packed screens.
- Accent color: `#c2410c` (rust/amber), not Technotopia's indigo.

Avoid:

- Random one-off colors outside the theme palette.
- Heavy shadows.
- Excessive animation.

---

## Performance

- Server Components by default; lazy-load heavy Client Components.
- Optimize images (Next.js `<Image>`, not raw `<img>`).
- Avoid unnecessary re-renders — check before reaching for `useEffect`.
- Keep bundle size in mind; don't import a whole library for one function.

---

## Code Quality — before finishing any task

- Remove dead code and duplicate code.
- `pnpm lint` clean.
- `pnpm tsc --noEmit` clean.
- `pnpm build` succeeds if the change touched routing/build behavior.
- Schema change → also `pnpm prisma generate` and confirm the migration applies.
- Verify responsive layout and basic accessibility (labels on inputs, focus states,
  contrast) on any new screen.
- Choose the simplest solution that satisfies the task — don't add abstraction for
  a hypothetical future need.

---

## Wireframe Rules

Two sources of truth exist here, and which one applies depends on the screen:

**Where a wireframe frame exists** — Login, Dashboard, Products, Categories,
Brands, Orders, Inventory, Customers, Settings (`top-oil.excalidraw`), and Car
Brands List/Add-Edit (`topoil-admin-new-frames.excalidraw`) — that frame is the
source of truth for what the screen contains:

- Do not invent new features beyond the frame.
- Do not add extra filters, columns, or fields beyond what's in the frame —
  except the specific additions called out in the matching task prompt in
  `topoil-admin-claude-code-tasks.md` (bilingual name fields, SEO meta fields,
  `partType`/`filterKind`, `oemPartNumbers` — these are deliberate, documented
  departures from the reused Technotopia frame, not scope creep).
- Do not add dashboards, analytics, or charts unless the frame shows them.
- Do not add extra buttons or additional CRUD operations.
- Do not change the page flow (list → form/detail pattern stays as designed).
- Only improve visual appearance, responsiveness, accessibility, and code quality
  beyond what the wireframe literally shows.

**Where no frame exists yet** — Car Models, Car Engines, Fitment Profiles,
the Fitment Preview tool, and Fitment Inquiries — there is no `.excalidraw` frame
to defer to. For these, the relevant task's prompt in
`topoil-admin-claude-code-tasks.md` (Phase 8, Phase 12) is the source of truth
instead of a frame, and the same discipline applies: build what the prompt
describes, don't add fields/filters/buttons it doesn't mention, and ask rather
than guess if something in the prompt is ambiguous. Do not treat "no wireframe"
as license to freelance the design — it just means the spec is written in prose
instead of drawn.

If functionality is unclear or a field's purpose is ambiguous in either case, ask —
don't guess and don't quietly "improve" scope.

---

## Deployment

Out of scope for day-to-day feature tasks. When the project reaches Phase 16 of the
task list (Docker + Compose + Nginx + Ubuntu VPS), follow `DEPLOYMENT.md` once it
exists — don't containerize or touch deploy config as a side effect of an unrelated task.
