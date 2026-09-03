# Top Oil — Production Readiness: Assessment & Task List

Written 2026-09-03, against commit `445879f` on `main`.

Source checklist: `ecommerce-production-readiness-checklist.md` (generic e-commerce
checklist, not written for this project). This document is the result of reading that
checklist against the actual codebase. **Where the two disagree, this document wins** —
the checklist assumes an app with a payment integration, multiple instances and a cloud
provider, and Top Oil is none of those things yet.

Companion docs: `CLAUDE.md` (rules), `AGENTS.md` (conventions), `DEPLOYMENT.md` (the VPS),
`topoil-admin-claude-code-tasks.md` / `topoil-storefront-claude-code-tasks.md` (feature history).

---

# A. Technical assessment

## A.0 What this project actually is

- **Next.js 16.2.12** App Router, React 19, TypeScript strict, Tailwind 4, HeroUI 3.
- **Prisma 7 + `@prisma/adapter-pg`** against **PostgreSQL 16**. 23 migrations, 31 models/enums.
- **REST route handlers only** — 58 of them (`app/api/admin/*` × 37, `app/api/storefront/*` × 18,
  `app/api/auth/*` × 3). No Server Actions for mutations.
- **Auth**: `jose` HS256 JWT, 7-day expiry, in an HTTP-only / `Secure` (prod) / `SameSite=Lax`
  cookie. `bcryptjs` hashing. One `User` table for admins (email login) and customers (phone login).
- **Deployment**: one shared Ubuntu VPS. Docker Compose (`postgres`, one-shot `migrate`, `app`),
  app published on `127.0.0.1:${TOPOIL_PORT}` only, host **Caddy** terminating TLS and reverse
  proxying. No published Postgres port. Non-root container user. Uploads on a named volume.
- **Tests**: 103 Vitest files, 10 Playwright specs. CI runs on PRs: lint → tsc → generate →
  migrate → seed → `vitest run`.
- **Catalog scale** (from `oil-city-import-notes.md`): ~3,469 products, 81 car brands,
  ~561 car models after regrouping, ~55k fitment items. Small.
- **No payment integration exists.** `CheckoutView.tsx` literally renders
  "Payment gateway (placeholder)". Orders are created `PENDING` / `UNPAID` and
  **`paymentStatus` is never written by any code path in the repo** — there is no route,
  no admin control, nothing. An order cannot currently be marked paid.

## A.1 Opinion of the checklist

It is a good _generic_ checklist and a poor _plan_. Three problems:

1. **It assumes a payment integration that does not exist.** Section 7 and Section 19 —
   webhook signature verification, duplicate payments, payment/order consistency,
   idempotent webhooks — are ~15% of the document and currently unimplementable. That is
   not a reason to skip them; it is a reason to make "choose the payment model" the
   _first_ task, because everything in that area is undefined until it is answered.

2. **It is provider-blind in a way that matters here.** The site is `oil-top.ir`, served
   from an Iranian VPS to Iranian customers. "CDN", "WAF", "DDoS protection" and
   "error tracking" all silently assume Cloudflare/Sentry/AWS. Those are unreliable or
   unavailable for this audience. The checklist items are right; the implied answers are
   wrong, and following them would add a dependency that gets blocked.

3. **It is undifferentiated by scale.** "Read replicas", "auto-scaling", "connection
   limits", "cache stampede prevention" and "backup restoration testing" sit as equal
   bullets. For a 3,469-SKU shop on one box, the last one is existential and the first
   three are noise. The checklist's own Rule 3 says this; the body of the document does not.

What the checklist gets _right_, and what I have kept verbatim in spirit: never trust
client prices, recompute server-side, transactional order creation, inventory race
protection, tested restores rather than assumed backups, and measuring capacity instead
of guessing it.

## A.2 Already implemented, and implemented well — do not rebuild

Verified by reading the code, not by assuming:

| Area                         | Where                                                              | Verdict                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-authoritative pricing | `server/order.ts:278` `createStorefrontOrder`                      | **Exemplary.** The client sends only `productId`, `quantity`, `addedAt`. Every price is re-read from `Product`, the 24-hour price hold is resolved against `ProductPriceLog`, and the cheaper of held-vs-current wins. Totals are recomputed. Nothing about money crosses the wire.                |
| Inventory race protection    | `server/order.ts` inside `prisma.$transaction`                     | **Correct.** `inventory.updateMany({ where: { productId, stock: { gte: qty } }, data: { decrement } })` — the check rides inside the WHERE, `count !== 1` throws, transaction rolls back. Two simultaneous checkouts cannot both take the last unit.                                               |
| Order snapshots              | `OrderItem.productNameSnapshot` / `priceSnapshot`                  | Correct — editing a product cannot rewrite history.                                                                                                                                                                                                                                                |
| Admin authorization          | all 37 files under `app/api/admin/`                                | **`requireAdmin()` is called in every single one** (verified programmatically). `proxy.ts` guards navigation; the route handlers re-verify. This is the defense-in-depth `CLAUDE.md` asks for, and it is actually done.                                                                            |
| IDOR / BOLA                  | `app/api/storefront/orders/[id]/route.ts` + `getCustomerOrderById` | Ownership checked server-side; 401 / 404 / 403 are three distinct answers.                                                                                                                                                                                                                         |
| Input validation             | `lib/validation/*` (28 schemas), every route                       | Zod on body, query **and** path params. Consistent `{ success, data }` / `{ success, error }` envelope.                                                                                                                                                                                            |
| File upload                  | `server/upload.ts`                                                 | **Better than most production apps.** MIME allowlist, 5 MB cap, **magic-byte sniffing** on top of the declared type, UUID filenames, no SVG, written outside the served source tree into a mounted volume.                                                                                         |
| SQL injection                | whole repo                                                         | Prisma everywhere. One `$executeRaw` in `scripts/refile-imported-products.ts` — a tagged template, parameterized, and offline-only. Clean.                                                                                                                                                         |
| Stored XSS                   | `lib/sanitize.ts`                                                  | `sanitize-html` with `allowedTags: []` — descriptions are stripped to plain text, not allowlisted. The right call for an admin with no rich-text editor. Only two `dangerouslySetInnerHTML` sites exist (theme init script, JSON-LD), both audited.                                                |
| Rate limiting                | `server/rateLimit.ts`                                              | Exists on all five public writes — login, register, fitment inquiry, stock notification, checkout — with separate buckets and sensible windows. (But see A.3 #1: it is bypassable.)                                                                                                                |
| Secrets                      | `.gitignore`, `.env*.example`                                      | No secret is tracked. Three example files, all placeholder.                                                                                                                                                                                                                                        |
| Container/network posture    | `docker-compose.prod.yml`, `deploy/caddy/`                         | Postgres has no `ports:`. App bound to `127.0.0.1`. `name: topoil` pins the compose project so `down -v` cannot reach a neighbour's volume. Non-root user, standalone output, migrations as a separate one-shot service so they run once per deploy even if `app` is scaled. This is careful work. |
| Order status transitions     | `server/order.ts` `VALID_TRANSITIONS`                              | A real state machine already exists — `PENDING → SENDING\|CANCELLED`, `SENT → DELIVERED`, terminal states empty. I expected this to be missing; it is not.                                                                                                                                         |

**Conclusion: the application-layer security of this codebase is above average for a
solo-developer project.** The gaps are almost entirely _operational_ — what happens when it
breaks, and whether you find out.

## A.3 Partially or incorrectly implemented

**1. Every rate limit in the app is trivially bypassable.** — `server/rateLimit.ts:getClientIp`

```ts
const forwardedFor = request.headers.get("x-forwarded-for");
if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
```

Caddy's `reverse_proxy` **appends** the peer address to any inbound `X-Forwarded-For`
rather than replacing it. So a request sent with `X-Forwarded-For: 1.2.3.4` arrives at the
app as `1.2.3.4, <real client>` and `split(",")[0]` returns the attacker's chosen value.
Rotating that header per request defeats login brute-force protection, checkout flooding,
inquiry spam and stock-notification spam simultaneously.

The Caddyfile already sets `header_up X-Real-IP {remote_host}` — an _overwrite_, and
therefore trustworthy. The fix is to prefer `X-Real-IP`, or to take the **last** XFF entry.
This is a one-file change and it is the highest value-per-line fix in this entire document.

**2. No idempotency on checkout.** `POST /api/storefront/orders` has no dedupe key. A
double-clicked submit button, a retried request on a flaky mobile connection, or a browser
back-then-resubmit creates **two orders and decrements stock twice**. This is a real
money/inventory bug today, at any traffic level, with no attacker required.

**3. Cancelling an order never returns its stock.** `updateOrderStatus` writes
`{ status }` and nothing else. Stock is decremented at order creation and there is no path
that puts it back. Every cancelled order permanently destroys inventory, and the shop's
stock figures drift away from the warehouse's.

**4. `paymentStatus` is unwritable.** Set to `UNPAID` at creation; no route, service
function or admin control ever changes it. The order model is designed for a two-status
world and half of it is inert. Combined with the placeholder gateway, the shop currently
has _no way to record that a customer paid_.

**5. `Order` has no indexes at all beyond its primary key.** The
`20260811110315_index_foreign_keys` migration indexed twelve FKs and missed
`Order.customerId` — the one that backs a customer's own order history. The admin Orders
screen filters on `status` / `paymentStatus` / `createdAt` range and sorts
`createdAt desc`, all unindexed. It is fast today because the table is nearly empty.

**6. `app/sitemap.ts` is `force-dynamic` and unbounded.** Every request runs four
unpaginated queries and materializes roughly **8,000 URL entries** (2 locales × ~3.5k
products + ~561 models + 81 brands + categories). It is public, uncached and unrate-limited.
This is the cheapest denial-of-service in the application — a loop over `curl /sitemap.xml`
will saturate the box long before the catalog pages do.

**7. No health endpoint and no container healthcheck on `app`.** `restart: unless-stopped`
restarts a _crashed_ process. It does nothing for a hung one, a process that lost its DB
pool, or a container that boots and serves 500s. Nothing anywhere answers "is it up?".

**8. No error boundaries.** There is no `error.tsx`, no `global-error.tsx` and no
`not-found.tsx` anywhere in `app/`. A Prisma failure while rendering a PDP shows Next's
unstyled default error page, in the wrong direction for `/fa`, with no way back.

**9. Effectively no logging.** One `console.error` in the entire application
(`server/inventory.ts:112`). No structured logs, no request IDs, no error tracking. When
something goes wrong in production you will learn about it from a phone call.

**10. No CSP, no HSTS.** Caddy sets `X-Frame-Options`, `X-Content-Type-Options` and
`Referrer-Policy` and stops there. There is an inline theme script that needs a nonce or a
hash, and inline JSON-LD.

**11. Backups do not exist.** `DEPLOYMENT.md` §8 says so in as many words: _"Neither is
backed up by anything yet"_. It documents the two commands and stops. There is no cron, no
off-box copy, and no restore has ever been attempted.

**12. CI does not run `next build` or Playwright.** A change that breaks the production
build or the checkout flow merges green.

**13. Login throttling is IP-only.** Five attempts per 15 minutes per IP, no per-account
counter and no lockout. Password-spraying one admin account from rotating addresses is
unthrottled — and per #1, "rotating addresses" currently means "rotating a header".

**14. `pnpm audit`: 19 findings (15 high, 4 moderate).** Almost all transitive through
`eslint` / `prisma` / `next` build tooling. Exactly one is a direct production dependency:
`sanitize-html@2.17.6` → 2.17.7 (GHSA-g8qq-57p8-ggw5, SVG SMIL scheme bypass). Note that
this project passes `allowedTags: []`, so that specific bypass is not reachable here — but
the version should still move.

**15. No request body size limit.** The Caddyfile comment notes, correctly, that Caddy
imposes none by default. `await request.json()` on `/api/storefront/orders` will happily
buffer whatever arrives.

**16. `proxy.ts` makes an HTTP round-trip to its own `/api/storefront/settings` on every
request to `/`** just to pick a default locale. It is guarded with a try/catch and a
sensible fallback, but it doubles the request count on the site's most-linked URL.

## A.4 Critical risks, ranked

1. **XFF spoofing defeats all rate limiting** — turns a protected app into an unprotected one.
2. **No checkout idempotency** — duplicate orders and double stock decrements, today.
3. **No backups** — a corrupted volume or a bad `down -v` loses the catalog, 55k fitment
   rows, every customer account and every order. The import work alone is weeks.
4. **Cancelled orders leak stock** — silent, cumulative, and invisible until someone counts.
5. **No observability** — every other failure on this list is undetectable in production.
6. **Sitemap amplification** — a trivially available DoS.

## A.5 What is missing from the checklist

- **A payment architecture decision.** Not an item; a prerequisite. See B.2.
- **Iran-specific infrastructure reality.** The checklist's CDN/WAF/error-tracking items
  need Iranian-viable answers (ArvanCloud; self-hosted GlitchTip or plain logs; Uptime
  Kuma) or they will be implemented as dependencies that stop working.
- **An admin audit log.** The checklist mentions it once, under monitoring. Here it is a
  data-integrity requirement: prices, stock levels and order statuses are all mutable by
  any admin with no trail whatsoever. `ProductPriceLog` already establishes the pattern.
- **Backup of uploaded media.** The checklist covers database backup and never mentions
  user-uploaded files. The `topoil_uploads` volume holds every product photo.
- **Stock restoration on cancellation.** Framed nowhere; a live bug here.
- **Guest order retrievability.** A guest's receipt lives only in `sessionStorage`. Close
  the tab and the order is unreachable to the customer forever. Operational, not security,
  but it will generate support calls.
- **Graceful shutdown / SIGTERM draining** for the standalone server, and a
  `stop_grace_period` in compose, so a redeploy does not cut an in-flight checkout.

## A.6 What is premature — do NOT implement

| Checklist item                                                     | Verdict                                                                                                                                                                                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kubernetes, microservices, service mesh, event-driven architecture | No. One box, one process, one team member.                                                                                                                                                                                             |
| Read replicas, sharding, PgBouncer                                 | No. 3,469 products. A single Postgres with ten pooled connections is three orders of magnitude oversized already.                                                                                                                      |
| Redis                                                              | **Not yet.** One process means an in-memory map _is_ a shared cache. Redis becomes necessary the moment a second replica exists — and at that point it is needed for rate limiting first, caching second. Defer, and note the trigger. |
| Auto-scaling, load balancing, multiple instances                   | Premature. But _record the two things that block it_ (in-memory rate limiter, uploads on local disk) so the option stays open. That is a documentation task, not an infrastructure one.                                                |
| WAF / dedicated DDoS appliance                                     | Nothing self-hostable is worth the operational cost here. Caddy-level connection limits plus the app's own limiters is proportionate. If real DDoS arrives it is an upstream provider decision, not a code change.                     |
| Point-in-time recovery / WAL archiving                             | Overkill at this order volume. A nightly `pg_dump`, copied off-box, with a **rehearsed** restore gives RPO ≈ 24h and RTO ≈ 1h. That is honest and adequate. Revisit at ~100 orders/day.                                                |
| Subresource Integrity                                              | Nothing to apply it to — there are zero third-party scripts.                                                                                                                                                                           |
| Circuit breakers                                                   | There are no external service calls to break. Revisit when the PSP and SMS provider exist.                                                                                                                                             |
| Full Prometheus/Grafana/Loki stack                                 | The VPS is _shared with other sites_. Structured JSON logs to stdout with Docker log rotation, plus external uptime checks, is the right size.                                                                                         |
| MFA for administrators                                             | Genuinely valuable, genuinely not first. P2, after the P0s.                                                                                                                                                                            |

## A.7 Items I combined or changed

- Checklist §1's seven scaling bullets → one **documentation** task (SCALE readiness notes),
  because the correct action today is to write down the blockers, not to build for them.
- §3's eight caching bullets → two tasks: cache the catalog reads, and invalidate them on
  admin write. "Cache stampede prevention" is dropped — Next's data cache dedupes.
- §12 and §18 overlap almost entirely → one load-testing phase, in which only the
  inventory-concurrency test is P0.
- §2 "read replicas", §11 "circuit breakers", §9 "SRI" → removed, with reasons above.
- §20 is a review, not a phase → it becomes the final task, `PROD-001`.
- §5's "refresh-token security" → dropped. This app uses a single 7-day JWT and has no
  refresh token. Adding one is not a security improvement at this scale; **session
  revocation** is the real gap behind that bullet, and it is folded into `SEC-002`.

## A.8 Architectural decisions that must come before other work

1. **`BASE-002` — the payment model.** Either (a) the shop is cash-on-delivery /
   phone-confirmed, in which case the checkout copy promising a bank gateway must change
   and `paymentStatus` becomes an admin-set field; or (b) a PSP is integrated. Nothing in
   Phase 9 can be specified until this is answered, and the `ORD-003` design depends on it.
2. **`SEC-001` — the trusted-proxy contract.** Every current and future limiter reads
   `getClientIp()`. Fix the source of truth before building anything else on top of it.
3. **`REL-003` — a logging seam.** The reliability and observability tasks all need
   somewhere to report to. Build the seam before the things that use it.
4. **`PERF-002`'s cache-key strategy** dictates where invalidation hooks go in the admin
   write paths, so it is decided once and applied, not retrofitted per route.

---

# B. Recommended architecture & strategy

## B.1 The target architecture (unchanged from today, deliberately)

```
                        Internet
                           │
                    Caddy (host, :443)
                    TLS · gzip/zstd · X-Real-IP
                    security headers · CSP · rate limit
                           │  127.0.0.1:3001
                 ┌─────────┴──────────┐
                 │  app (Next 16)     │  1 container, standalone output
                 │  · route handlers  │  in-memory rate limiter
                 │  · Next data cache │  structured JSON logs → stdout
                 └─────────┬──────────┘
                           │ compose network only
                 ┌─────────┴──────────┐
                 │  postgres:16       │  named volume, no published port
                 └────────────────────┘
                           │
              nightly pg_dump + uploads tar → off-box
```

**No new infrastructure component is introduced by this plan.** Not Redis, not a CDN, not a
message queue. Every P0 and P1 task is a code, config or cron change inside what already
exists. That is the correct answer for this workload, and it is also what keeps the plan
executable by one person.

## B.2 The payment question

Two viable models. Pick one in `BASE-002`, and pick it before Phase 9 is scoped.

**Model A — Cash on delivery / phone confirmation (no gateway).** Order is placed
`PENDING`/`UNPAID`; staff call to confirm; `paymentStatus` becomes an admin-controlled field
with its own transition rules and audit entries. Checkout copy in `CheckoutView.tsx` and
`CheckoutSummary.tsx` (which currently promises «به درگاه بانک می‌روید») must be rewritten.
Cheapest, fastest, and adequate for a shop that already takes orders by phone.

**Model B — Iranian PSP (Zarinpal / IDPay / Behpardakht / Saman).** Redirect-and-verify,
not webhooks: the customer returns to a callback URL and the app performs a **server-side
verify call** against the PSP before marking anything paid. That verify call is the security
boundary — the callback's query string is attacker-controlled and must never be trusted on
its own. Requires: a `Payment` model, an idempotent settlement path, a reconciliation job
for the customer-closed-the-tab case, and a refund path. Three tasks, `PAY-001`–`PAY-003`.

Whichever is chosen, one rule holds: **stock is already decremented at order creation.**
If you move to Model B you must decide whether an unpaid order holds stock and for how long,
and build the expiry that releases it. That decision belongs in `BASE-002`.

## B.3 What "10,000 users" means, concretely

The number is meaningless as stated, so here is the reading this plan is built on. These are
**assumptions** — `BASE-001` exists to replace them with measurements.

| Quantity                | Assumption                      | Basis                                                 |
| ----------------------- | ------------------------------- | ----------------------------------------------------- |
| Daily unique users      | 10,000                          | The stated target, read as _per day_, not concurrent. |
| Pages per session       | ~6                              | Car finder is 4 steps, then a PLP and a PDP.          |
| Daily page views        | ~60,000                         | 10k × 6.                                              |
| Flat request rate       | ~0.7 rps                        | 60k / 86,400.                                         |
| Peak-hour rate          | **~3 rps**                      | 4× flat, evening peak.                                |
| Campaign spike          | **20–50 rps for 2–5 min**       | One Instagram post. This is the case that hurts.      |
| Peak concurrent users   | 100–200                         | 3 rps × ~50 s think time.                             |
| Orders/day @ 1.5% conv. | ~150                            | Peak ~25/hour — **under one order per minute.**       |
| Order rows/year         | ~55,000                         | Trivial.                                              |
| DB size, year 1         | **< 1 GB**                      | 3.5k products, 55k fitment items, 55k order rows.     |
| Catalog size            | 3,469 products / 561 car models | Measured, from the import notes.                      |

**What this tells you:** the database is not, and will not become, the bottleneck. Order
writes are not the bottleneck — one per minute at peak. **The bottleneck is Node CPU
rendering uncached React on a shared VPS**, because today every storefront page is
`dynamic` (they read `searchParams`) and therefore re-renders and re-queries per request.

Therefore the path to comfortably serving this traffic is, in order:

1. Cache the three page types that are ~95% of traffic — PLP, PDP, category (`PERF-002`).
2. Cache the sitemap, which is disproportionately expensive per hit (`PERF-001`).
3. Add the missing `Order` indexes so the admin panel stays usable as orders accumulate (`ORD-004`).
4. **Measure it** with k6 (`LOAD-001`) instead of believing any of the above.

A second application instance is **not** required for 10,000 daily users. It becomes
worth having for _availability_ — so a deploy or a crash is not an outage — and that is a
different problem with a different answer. `SCALE-001` documents the two blockers so the
door stays open.

**The SLO to test against** (`LOAD-001` / `LOAD-002` assert these):

- p95 < 500 ms on PLP and PDP at 25 rps sustained for 5 minutes.
- Error rate < 0.5% at that load.
- **Zero oversells** with 50 concurrent checkouts contending for the last unit of stock.
- Postgres connections stay under the pool ceiling; no connection-exhaustion errors.

## B.4 Blocking vs. deferrable

**Blocking production launch (must be done before the site takes a real order):**

`BASE-001`, `BASE-002`, `SEC-001`, `ORD-001`, `ORD-002`, `DR-001`, `DR-002`, `LOAD-002`,
`PROD-001` — plus `PAY-001`–`PAY-003` if `BASE-002` chooses Model B.

**Do within the first weeks of traffic (P1):** `SEC-002`, `SEC-003`, `ORD-003`, `ORD-004`,
`REL-001`–`REL-003`, `PERF-001`, `PERF-002`, `RATE-001`, `OBS-001`, `CI-001`, `LOAD-001`.

**Can wait until traffic actually grows (P2/P3):** `SEC-004`, `SEC-005`, `REL-004`,
`REL-005`, `PERF-003`–`PERF-005`, `OBS-002`, `CI-002`, `SCALE-001`.

---

# C. Dependency-aware task list

Execute top to bottom within a phase. `→` means "requires".

### Phase 0 — Baseline & decisions

| ID         | Title                                          | Pri | Requires |
| ---------- | ---------------------------------------------- | --- | -------- |
| `BASE-001` | Measure the baseline; record scale assumptions | P0  | —        |
| `BASE-002` | Decide and record the payment model            | P0  | —        |

### Phase 1 — Critical security

| ID        | Title                                              | Pri    | Requires  |
| --------- | -------------------------------------------------- | ------ | --------- |
| `SEC-001` | Trust the right client IP (fixes every rate limit) | **P0** | —         |
| `SEC-002` | Per-account login throttle + session revocation    | P1     | `SEC-001` |
| `SEC-003` | Security headers, CSP and HSTS                     | P1     | —         |
| `SEC-004` | Request body size limits                           | P2     | `SEC-003` |

### Phase 2 — Order, inventory & money correctness

| ID        | Title                                     | Pri    | Requires              |
| --------- | ----------------------------------------- | ------ | --------------------- |
| `ORD-001` | Checkout idempotency                      | **P0** | —                     |
| `ORD-002` | Restore stock when an order is cancelled  | **P0** | —                     |
| `ORD-003` | Make `paymentStatus` writable, with rules | P1     | `BASE-002`, `ORD-002` |
| `ORD-004` | Add the missing `Order` indexes           | P1     | —                     |

### Phase 3 — Reliability

| ID        | Title                                 | Pri | Requires  |
| --------- | ------------------------------------- | --- | --------- |
| `REL-001` | Health endpoint + container hardening | P1  | —         |
| `REL-002` | Error and not-found boundaries        | P1  | —         |
| `REL-003` | Structured logging + request IDs      | P1  | —         |
| `REL-004` | Error tracking                        | P2  | `REL-003` |
| `REL-005` | DB pool sizing + graceful shutdown    | P2  | `REL-001` |

### Phase 4 — Performance & caching

| ID         | Title                                           | Pri | Requires   |
| ---------- | ----------------------------------------------- | --- | ---------- |
| `PERF-001` | Cache the sitemap and robots.txt                | P1  | —          |
| `PERF-002` | Cache catalog reads + invalidate on admin write | P1  | `BASE-001` |
| `PERF-003` | Image and static asset delivery                 | P2  | `PERF-002` |
| `PERF-004` | Trigram index for product search                | P2  | `BASE-001` |
| `PERF-005` | Drop the proxy's self-fetch on `/`              | P2  | —          |

### Phase 5 — Traffic protection

| ID         | Title                                        | Pri | Requires  |
| ---------- | -------------------------------------------- | --- | --------- |
| `RATE-001` | Extend rate limiting to reads + Caddy limits | P1  | `SEC-001` |

### Phase 6 — Observability & audit

| ID        | Title                          | Pri | Requires  |
| --------- | ------------------------------ | --- | --------- |
| `OBS-001` | Admin audit log                | P1  | `REL-003` |
| `OBS-002` | Uptime monitoring and alerting | P2  | `REL-001` |

### Phase 7 — Backup & disaster recovery

| ID       | Title                                   | Pri    | Requires |
| -------- | --------------------------------------- | ------ | -------- |
| `DR-001` | Automated backups, off-box              | **P0** | —        |
| `DR-002` | Rehearse the restore; write the runbook | **P0** | `DR-001` |

### Phase 8 — Supply chain & CI

| ID       | Title                                      | Pri | Requires |
| -------- | ------------------------------------------ | --- | -------- |
| `CI-001` | CI: build, E2E and audit gates             | P1  | —        |
| `CI-002` | Dependency remediation + automated updates | P2  | `CI-001` |

### Phase 9 — Payment integration (only if `BASE-002` chose Model B)

| ID        | Title                                         | Pri | Requires              |
| --------- | --------------------------------------------- | --- | --------------------- |
| `PAY-001` | PSP adapter + `Payment` model                 | P0* | `BASE-002`, `ORD-001` |
| `PAY-002` | Callback verification + idempotent settlement | P0* | `PAY-001`             |
| `PAY-003` | Reconciliation sweep + refund path            | P1* | `PAY-002`             |

### Phase 10 — Load & stress testing

| ID         | Title                                 | Pri    | Requires              |
| ---------- | ------------------------------------- | ------ | --------------------- |
| `LOAD-001` | k6 catalog load & spike test          | P1     | `PERF-002`, `REL-001` |
| `LOAD-002` | Checkout & inventory concurrency test | **P0** | `ORD-001`, `ORD-002`  |

### Phase 11 — Production readiness

| ID          | Title                                 | Pri    | Requires     |
| ----------- | ------------------------------------- | ------ | ------------ |
| `SEC-005`   | Admin MFA (TOTP)                      | P2     | `SEC-002`    |
| `SCALE-001` | Document the second-instance blockers | P3     | `RATE-001`   |
| `PROD-001`  | Go-live review                        | **P0** | all P0 tasks |

---

# D. Copy-paste task prompts

Each block below is self-contained. Open a fresh Claude Code session in `D:\Code\topoil`,
paste one block, let it finish, then start the next session.

Every task inherits the project's standing rules — read `CLAUDE.md` and `AGENTS.md` first,
`pnpm lint` and `pnpm tsc --noEmit` must be clean before finishing, and no task may expand
its own scope. Those are not repeated in each prompt.

---

## Phase 0 — Baseline & decisions

### BASE-001

```text
TASK ID: BASE-001
TITLE: Measure the performance baseline and record scale assumptions
PRIORITY: P0
PREREQUISITES: none

CONTEXT
Top Oil is a Next.js 16 (App Router) + Prisma 7 + PostgreSQL 16 e-commerce site for engine
oils and filters, deployed as a single Docker container behind Caddy on a shared Ubuntu VPS
(see DEPLOYMENT.md). Catalog size: ~3,469 products, 81 car brands, ~561 car models, ~55k
fitment items. A production-readiness plan is being executed and every performance task
after this one needs numbers to compare against. Right now nobody knows how fast anything is.

OBJECTIVE
Produce a written, reproducible performance baseline of the storefront's hot paths, plus a
documented set of scale assumptions. No production code changes at all. Output is one new
markdown file.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read app/[locale]/products/page.tsx, app/[locale]/products/[slug]/page.tsx,
  app/[locale]/categories/[slug]/page.tsx, app/[locale]/fitment/page.tsx and app/sitemap.ts
  to see which are dynamic and why (most read searchParams, so they re-render per request).
- Read lib/services/catalog.ts and lib/services/fitment.ts for the queries behind them.
- Confirm the dev database is running: `docker compose up -d db` (it listens on port 5434;
  a blank Prisma error usually means Docker Desktop is not running).

IMPLEMENTATION
1. Build and start the app in production mode locally: `pnpm build` then `pnpm start`.
   Do NOT measure `next dev` — its numbers are meaningless.
2. For each of these paths, measure cold and warm server response time (5 requests each,
   record min/median/max) using `curl -w "%{time_total}"` or `autocannon`:
     /fa                          (home)
     /fa/products                 (PLP, unfiltered)
     /fa/products?search=فیلتر    (PLP, searched)
     /fa/products/<a real slug>   (PDP)
     /fa/categories/<a real slug> (category landing)
     /fa/fitment?...              (fitment results for a real car engine)
     /sitemap.xml
     /api/storefront/products?page=1
3. Record the row counts that matter: products, categories, brands, carBrands, carModels,
   carEngines, fitmentProfileItems, orders, users. Use a short tsx script under scripts/ or
   `docker compose exec db psql`.
4. For the three slowest paths, capture the actual SQL: set `log_min_duration_statement = 0`
   on the dev Postgres, hit the path once, and copy the statements plus their durations.
   Run `EXPLAIN ANALYZE` on the slowest query in each and record the plan (note any
   Seq Scan on Product or Order).
5. Measure the production bundle: record the route table `next build` prints (First Load JS
   per route), and flag any route over 200 kB First Load JS.
6. Write everything into a new file `PERFORMANCE-BASELINE.md` at the repo root, structured as:
   Environment (machine, Node version, DB, dataset sizes) · Method (exact commands, so it can
   be re-run) · Results tables · Observations · Assumptions.
7. In the Assumptions section, record these explicitly as ASSUMPTIONS, not facts, and mark
   each as unverified: 10,000 daily users; ~6 pages/session; ~60k page views/day; ~0.7 rps
   flat; ~3 rps peak hour; 20-50 rps campaign spike; ~150 orders/day; <1 GB database in
   year one. Add the SLO targets that later load tests will assert:
   p95 < 500 ms on PLP/PDP at 25 rps; error rate < 0.5%; zero oversells under concurrency.

VALIDATION
- `pnpm lint` and `pnpm tsc --noEmit` clean (a scripts/ helper must type-check).
- PERFORMANCE-BASELINE.md exists and a second person could re-run every measurement from it.

ACCEPTANCE CRITERIA
- Timings recorded for all eight paths, cold and warm.
- Row counts recorded for all nine tables.
- At least three EXPLAIN ANALYZE plans captured, with Seq Scans called out.
- Bundle sizes per route recorded.
- Scale assumptions and SLO targets written down and labelled as assumptions.

DO NOT
- Do not change any application code, schema, or config to "improve" a number. This task
  only measures. Optimisation is PERF-001..PERF-004.
- Do not measure against `next dev`.
- Do not run against the production VPS.
- Do not add a benchmarking dependency to package.json dependencies (devDependencies only,
  and only if genuinely needed).

FINAL REPORT
Report: files added; the eight timings; the row counts; which queries showed Seq Scans;
the three slowest paths in order; anything you could not measure and why.
```

---

### BASE-002

```text
TASK ID: BASE-002
TITLE: Decide and record the payment model
PRIORITY: P0
PREREQUISITES: none

CONTEXT
Top Oil (Next.js 16 + Prisma 7 + PostgreSQL, Iranian storefront at oil-top.ir) has a
complete checkout that creates orders — but no payment integration whatsoever.
Specifically, verified in the codebase:
  - server/order.ts `createStorefrontOrder` creates every order with
    status: "PENDING", paymentStatus: "UNPAID".
  - `paymentStatus` is NEVER written anywhere else. No route, no service function, no admin
    control changes it. An order can never become PAID.
  - components/storefront/checkout/CheckoutView.tsx renders the literal text
    "Payment gateway (placeholder)" / «درگاه پرداخت (جای‌نما)», and CheckoutSummary.tsx tells
    the customer «سپس به درگاه بانک می‌روید» — a promise the app does not keep.
  - Stock is decremented at order creation, inside the transaction, before any payment.
Every downstream payment/order-consistency task is unspecifiable until this is settled.

OBJECTIVE
Produce a written decision record choosing between the two viable models, with enough
detail that the follow-on implementation tasks can be executed from it. This is a
DESIGN task. The only code change permitted is fixing customer-facing copy if Model A
is chosen (see step 5).

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read server/order.ts in full, especially createStorefrontOrder and VALID_TRANSITIONS.
- Read prisma/schema.prisma: the Order, OrderItem, Inventory and PaymentStatus definitions.
- Read components/storefront/checkout/CheckoutView.tsx and CheckoutSummary.tsx.
- Read app/(admin)/admin/orders/[id]/page.tsx to see what the admin can currently change.

IMPLEMENTATION
1. Write a new file `docs-payment-decision.md` at the repo root (docs/ is gitignored, so
   put it at the root alongside the other topoil-*.md planning docs).
2. Lay out both models honestly:
   MODEL A — Cash on delivery / phone confirmation, no gateway.
     Order stays PENDING/UNPAID; staff confirm by phone; paymentStatus becomes an
     admin-controlled field. Requires: an admin payment-status control with its own
     transition rules, and rewriting the checkout copy that promises a bank gateway.
   MODEL B — Iranian PSP redirect+verify (Zarinpal / IDPay / Behpardakht / Saman).
     Customer is redirected out, returns to a callback URL, and the app makes a
     SERVER-SIDE verify call to the PSP before marking anything paid. Requires: a Payment
     model, an idempotent settlement path, a reconciliation job for abandoned returns, and
     a refund path.
3. For whichever model is chosen, answer these questions explicitly in the document — they
   are the inputs the implementation tasks need:
   a. Does an unpaid order hold stock? For how long? What releases it? (Today stock is
      taken at order creation and never returned — see ORD-002.)
   b. What are the legal paymentStatus transitions? UNPAID→PAID, PAID→REFUNDED, and what
      else? Is UNPAID→REFUNDED ever legal?
   c. Who is allowed to change paymentStatus, and is that action audited? (See OBS-001.)
   d. What happens to paymentStatus when an order is CANCELLED?
   e. For Model B only: which PSP, what are its verify-call semantics, where do its
      credentials live (env vars only — see the .env.production.example convention), and
      what is the exact idempotency key for settlement?
4. State the decision, the date, and the reasoning, in the same voice as the existing
   "Design decisions" sections in topoil-storefront-claude-code-tasks.md.
5. IF AND ONLY IF Model A is chosen: fix the customer-facing copy in CheckoutView.tsx and
   CheckoutSummary.tsx so it no longer promises a bank gateway. Both locales (en/fa). This
   is the only code change in this task.

VALIDATION
- If copy changed: `pnpm lint`, `pnpm tsc --noEmit`, and `pnpm test` all clean.
- If copy changed: check the en and fa strings are both updated and read naturally in each.

ACCEPTANCE CRITERIA
- docs-payment-decision.md exists, names a chosen model, and answers questions 3a-3e.
- If Model A: no remaining customer-facing text promises a payment gateway.
- If Model B: the chosen PSP is named and its credential env vars are listed (not filled in).

DO NOT
- Do not implement any payment integration in this task.
- Do not add a PSP SDK to package.json.
- Do not put any credential, key or merchant ID anywhere in the repo, including examples.
- Do not change server/order.ts, the schema, or any migration.
- Do not "improve" the checkout beyond the copy fix in step 5.

FINAL REPORT
Report: the model chosen and why; the answers to 3a-3e; whether copy was changed and where;
which follow-on tasks (ORD-003, PAY-001..003) are now unblocked or cancelled.
```

---

## Phase 1 — Critical security

### SEC-001

```text
TASK ID: SEC-001
TITLE: Trust the right client IP — fixes a bypass of every rate limit in the app
PRIORITY: P0
PREREQUISITES: none

CONTEXT
Top Oil (Next.js 16 route handlers, single container behind a host Caddy on a shared VPS)
rate-limits five public write endpoints — login, register, fitment inquiry, stock
notification and checkout — in server/rateLimit.ts. All five key their bucket on
`getClientIp(request)`, which is:

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
    return request.headers.get("x-real-ip") ?? "unknown";

Caddy's reverse_proxy APPENDS the peer address to any inbound X-Forwarded-For rather than
replacing it. So a request sent with `X-Forwarded-For: 1.2.3.4` reaches the app as
"1.2.3.4, <real client>", and split(",")[0] returns the attacker's value. Rotating that
header per request defeats all five limiters simultaneously — including admin login
brute-force protection and checkout flooding.

deploy/caddy/oil-top.ir.caddy already sets `header_up X-Real-IP {remote_host}`, which is an
overwrite and therefore trustworthy. This task makes the app trust that instead.

OBJECTIVE
Make getClientIp() return an identifier the client cannot control, in both the deployed
topology and local development, and prove the bypass is closed with a test.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read server/rateLimit.ts in full — note the five buckets and their windows.
- Read deploy/caddy/oil-top.ir.caddy — note which headers Caddy sets and how.
- Read every caller: grep for getClientIp across app/api/.
- Read DEPLOYMENT.md §5 to confirm the deployed proxy topology (host Caddy -> 127.0.0.1:PORT).

IMPLEMENTATION
1. Rewrite getClientIp so that, in order of preference, it:
   a. reads `x-real-ip` first — Caddy overwrites this, so it is the trusted source;
   b. falls back to the LAST entry of `x-forwarded-for` (the hop nearest this server), not
      the first, if x-real-ip is absent;
   c. returns "unknown" if neither is present.
   Explain in a comment WHY the last XFF entry rather than the first, referencing Caddy's
   append behaviour — a future reader will otherwise "fix" it back.
2. Consider making the trusted-header choice explicit rather than implicit: a single
   documented constant or a short comment block at the top of the file stating the
   deployment contract ("exactly one trusted reverse proxy sits in front of this app; it
   overwrites X-Real-IP"). Keep it simple — no new env var unless you can justify it.
3. Harden deploy/caddy/oil-top.ir.caddy to match: make Caddy REPLACE the inbound
   X-Forwarded-For rather than append to it, so both headers agree. Use
   `header_up X-Forwarded-For {remote_host}` alongside the existing X-Real-IP line, and
   comment why. Note in DEPLOYMENT.md that the Caddy site block must be reloaded
   (`sudo caddy validate` then `sudo systemctl reload caddy`, never restart) for this to
   take effect — §5.3 already documents that procedure.
4. Add unit tests in a new server/rateLimit.test.ts (Vitest, matching the style of
   lib/auth/jwt.test.ts) covering:
   - x-real-ip present -> that value is used, even when x-forwarded-for is also present
     with a different first entry;
   - only x-forwarded-for present, multiple entries -> the LAST entry is used;
   - neither header -> "unknown";
   - a spoofed first XFF entry cannot cause two requests from one client to land in
     different buckets (i.e. the limiter still trips).

VALIDATION
- `pnpm test` — the new rateLimit tests pass alongside the existing 103 test files.
- `pnpm lint` and `pnpm tsc --noEmit` clean.
- Manual: run `pnpm build && pnpm start`, then send 6 POSTs to /api/auth/login with bad
  credentials and a DIFFERENT spoofed `X-Forwarded-For` on each. The 6th must return 429.
  Before the fix it returns 401 forever. Record both results.

ACCEPTANCE CRITERIA
- getClientIp cannot be influenced by a client-supplied X-Forwarded-For in the deployed
  topology.
- The manual 6-request check returns 429.
- server/rateLimit.test.ts exists and covers all four cases above.
- The Caddy site block and DEPLOYMENT.md agree with the code's assumption.

DO NOT
- Do not switch to Redis or any shared store — that is a later, separate decision.
- Do not change the bucket windows or attempt counts.
- Do not add new rate-limited endpoints here (that is RATE-001).
- Do not touch any route handler; this is confined to server/rateLimit.ts, the Caddy file,
  DEPLOYMENT.md and the new test.

FINAL REPORT
Report: files changed; the before/after result of the 6-request spoofing check; the tests
added; whether the Caddy change requires a VPS reload (it does — say so explicitly so the
operator knows the fix is not live until then).
```

---

### SEC-002

```text
TASK ID: SEC-002
TITLE: Per-account login throttling and session revocation
PRIORITY: P1
PREREQUISITES: SEC-001

CONTEXT
Top Oil's login (app/api/auth/login/route.ts -> server/auth.ts `authenticate`) is protected
only by an IP-keyed bucket in server/rateLimit.ts: 5 attempts per 15 minutes per IP. There
is no per-ACCOUNT counter, so password-spraying a single known admin address from many
sources is unthrottled. There is also no way to invalidate an issued session: the JWT is a
stateless jose HS256 token with a 7-day expiry (lib/auth/jwt.ts), so deactivating a user in
the admin panel stops them logging in AGAIN but does not evict the session they already
hold — for up to seven days.

Note: getCurrentUser() in server/auth.ts DOES re-read the user row on every request, so a
DEACTIVATED user is already rejected at that point. Verify this before assuming otherwise —
the gap may be narrower than it looks, and the honest answer belongs in the final report.

OBJECTIVE
Add a per-identifier login throttle alongside the existing per-IP one, and close whatever
session-revocation gap actually exists after verifying the above.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read server/rateLimit.ts (post-SEC-001), server/auth.ts, lib/auth/jwt.ts,
  lib/auth/cookies.ts, app/api/auth/login/route.ts, app/api/auth/logout/route.ts.
- Read server/customer.ts `updateCustomerStatus` — the deactivate path.
- Read lib/validation/auth.ts to see how an identifier is normalised (phone vs email).

IMPLEMENTATION
1. Add an identifier-keyed bucket to server/rateLimit.ts — e.g. 10 attempts per 15 minutes
   per normalised identifier — and a `checkIdentifierLoginRateLimit(identifier)`. Key it on
   the NORMALISED identifier (see normalizePhone in lib/auth/identifier.ts) so "0912 345"
   and "0912345" share a bucket. Keep it a separate bucket from the IP one; both must pass.
2. Wire it into app/api/auth/login/route.ts. Both limiters must be checked; the response
   must be the SAME generic 429 message in either case — do not reveal which limit tripped,
   and do not reveal whether the account exists.
3. Confirm the login route's error responses do not distinguish "no such user" from "wrong
   password". Read server/auth.ts `authenticate` — it currently throws one AuthError for
   both, which is correct. Verify, do not rebuild.
4. Verify the session-revocation claim empirically: log in as a customer, deactivate that
   customer via the admin panel, then hit an authenticated storefront route with the still-
   valid cookie. Record what happens. If getCurrentUser() already rejects them, say so and
   implement nothing further for revocation. If it does not, add the minimal check that
   makes it so — in getCurrentUser(), not with a new token store.
5. Add tests to server/rateLimit.test.ts (created in SEC-001) for the identifier bucket,
   and a test that the two buckets are independent (tripping one does not trip the other).

VALIDATION
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- Manual: 11 failed logins against ONE identifier from different X-Real-IP values must end
  in 429. 5 failed logins against DIFFERENT identifiers from one IP must also end in 429.
- Manual: the deactivation check from step 4, with the result recorded.

ACCEPTANCE CRITERIA
- A single account cannot be attacked faster than 10 attempts / 15 min regardless of source.
- 429 responses are indistinguishable between the two limiters.
- Login errors do not disclose account existence.
- The session-revocation behaviour is verified and documented in the final report.

DO NOT
- Do not add refresh tokens. This app has one 7-day JWT and that is a deliberate choice.
- Do not add a database-backed session/token table — it is not justified at this scale.
- Do not add account lockout (a permanent lock is a denial-of-service against the shop's
  own admin). Throttling only.
- Do not change the JWT expiry or the cookie settings.

FINAL REPORT
Report: files changed; the two manual throttle results; what you found about session
revocation and what you did about it; tests added.
```

---

### SEC-003

```text
TASK ID: SEC-003
TITLE: Security headers, Content-Security-Policy and HSTS
PRIORITY: P1
PREREQUISITES: none

CONTEXT
Top Oil serves oil-top.ir through a host Caddy that reverse-proxies to the app on
127.0.0.1. deploy/caddy/oil-top.ir.caddy currently sets exactly three headers:
X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy:
strict-origin-when-cross-origin. There is no Content-Security-Policy and no HSTS.

Two inline scripts exist and must keep working:
  - app/[locale]/layout.tsx renders THEME_INIT_SCRIPT via dangerouslySetInnerHTML as the
    first child of <body>. It MUST run before first paint (deleting it causes a flash of
    the wrong theme on every cold load — read the comment there before touching it).
  - components/storefront/JsonLd.tsx renders JSON-LD via dangerouslySetInnerHTML.
There are zero third-party scripts. Fonts are self-hosted via next/font (Geist, Vazirmatn).
Images come from the app's own /uploads and /public.

OBJECTIVE
Add a Content-Security-Policy that is actually enforced (not report-only forever) plus HSTS
and the remaining sensible headers, without breaking the theme script, JSON-LD, HeroUI, or
Next's own inline runtime.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read deploy/caddy/oil-top.ir.caddy and DEPLOYMENT.md §5.
- Read app/[locale]/layout.tsx (the theme script and the comment explaining it) and
  lib/storefront/theme.ts.
- Read components/storefront/JsonLd.tsx.
- Read next.config.ts (currently only `output: "standalone"`).
- Check whether HeroUI or Tailwind inject inline <style> at runtime — this determines
  whether style-src needs 'unsafe-inline'.

IMPLEMENTATION
1. Decide where the headers live and say why in a comment. Recommendation: put CSP in
   next.config.ts `headers()` so it is versioned with the app and testable locally, and
   keep the transport-level headers (HSTS) in Caddy where TLS is terminated. Do not set the
   same header in both places.
2. Build the policy from what the app actually loads. Start from:
     default-src 'self';
     script-src 'self' <nonce-or-hash for the theme script>;
     style-src 'self' 'unsafe-inline'   (only if verified necessary — check first);
     img-src 'self' data: blob:;
     font-src 'self';
     connect-src 'self';
     frame-ancestors 'none';
     base-uri 'self';
     form-action 'self';
     object-src 'none';
     upgrade-insecure-requests;
   For the theme script, prefer a static SHA-256 hash over a nonce: the script is a
   compile-time constant (THEME_INIT_SCRIPT), so a hash needs no per-request plumbing and
   cannot be got wrong by caching. Same for JSON-LD if it turns out to need it (it is
   type="application/ld+json", which is not executed, so it usually does not).
3. Add HSTS in Caddy: `Strict-Transport-Security "max-age=31536000; includeSubDomains"`.
   Do NOT add `preload` — that is effectively irreversible and is the operator's call.
4. Add the headers Caddy is missing: X-Frame-Options is already there; add
   `Permissions-Policy` denying camera, microphone and geolocation (the app uses none), and
   remove any Server/X-Powered-By disclosure Next adds (`poweredByHeader: false` in
   next.config.ts).
5. Verify by loading, in a browser with the console open, in BOTH locales and BOTH themes:
   /fa, /en, a PLP, a PDP, the cart, the checkout, the fitment wizard, and /admin (which is
   a separate root layout — check it too). Zero CSP violations. If a violation appears,
   narrow the policy to allow exactly that thing, with a comment saying what needed it —
   do not widen to 'unsafe-inline' for scripts under any circumstances.

VALIDATION
- `pnpm build && pnpm start`, then `curl -I http://localhost:3000/fa` shows the headers.
- Browser console shows zero CSP violations on the nine pages listed in step 5.
- The light/dark theme still applies before first paint (no flash) — reload /fa several
  times with the theme set to dark and confirm.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.
- `pnpm test:e2e` if it can be run (note: a running `next dev` blocks Playwright, and the
  E2E DB on port 5435 needs SEED_RESET=1 on first setup).

ACCEPTANCE CRITERIA
- An enforced (not report-only) CSP is served on every storefront and admin route.
- script-src does not contain 'unsafe-inline' or 'unsafe-eval'.
- HSTS is served by Caddy with max-age >= 1 year and no preload.
- The theme script still runs before first paint; JSON-LD still validates.
- No page in step 5 logs a CSP violation.

DO NOT
- Do not use 'unsafe-inline' or 'unsafe-eval' in script-src.
- Do not add `preload` to HSTS.
- Do not delete or defer the theme init script to satisfy the policy.
- Do not set the same header in both Caddy and Next.
- Do not introduce a CSP nonce that requires making static pages dynamic.

FINAL REPORT
Report: the final policy string; where each header is set and why; whether style-src needed
'unsafe-inline' and what forced it; the nine pages checked; that the Caddy change needs a
`caddy validate` + `systemctl reload caddy` on the VPS before it is live.
```

---

### SEC-004

```text
TASK ID: SEC-004
TITLE: Request body size limits
PRIORITY: P2
PREREQUISITES: SEC-003

CONTEXT
Top Oil's API is ~58 Next.js route handlers. Public write endpoints parse JSON with
`await request.json()` with no size bound — see app/api/storefront/orders/route.ts,
app/api/storefront/fitment-inquiries/route.ts, app/api/storefront/auth/register/route.ts
and app/api/storefront/products/[slug]/notify-me/route.ts. The image upload endpoint
(app/api/admin/upload/route.ts -> server/upload.ts) does enforce a 5 MB cap, but only after
`file.size` is read.

deploy/caddy/oil-top.ir.caddy notes explicitly that "unlike nginx, Caddy imposes no default
request body limit" — that comment was written to explain why 5 MB uploads pass through,
but the flip side is that nothing bounds anything else either.

OBJECTIVE
Bound request body sizes at the edge and in the app, without breaking the 5 MB image upload.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read deploy/caddy/oil-top.ir.caddy and its body-limit comment.
- Read server/upload.ts (MAX_FILE_SIZE_BYTES = 5 MB) and app/api/admin/upload/route.ts.
- List every route handler that calls request.json() or request.formData():
  grep -rn "request.json()\|request.formData()" app/api/
- Read lib/validation/storefront.ts — note whether array fields (e.g. checkout `items`)
  already have a max length. If the cart array is unbounded, that is a separate amplifier.

IMPLEMENTATION
1. In Caddy, set a global body limit for the site and a larger one scoped to the upload
   path only. Use `request_body { max_size ... }`, e.g. 128KB for the site and 6MB matched
   to `/api/admin/upload`. Comment the two numbers and why they differ.
2. In the app, add a small shared helper (suggested: lib/http/body.ts, or extend an existing
   module if one fits better — do not create a new top-level folder, per CLAUDE.md) that
   reads a JSON body with a byte ceiling and returns null on overflow, so route handlers
   answer 413 rather than buffering. Apply it to the four public write routes listed above.
   Keep it simple: check `content-length` first, and guard the read.
3. Check the Zod schemas for unbounded arrays and strings on public inputs — particularly
   the checkout `items` array in lib/validation/storefront.ts and any free-text field
   (message, contact, adminNote). Add `.max()` where a bound is missing. A cart with 10,000
   line items is a more effective attack than a large body, because each line triggers a
   ProductPriceLog query in server/order.ts.
4. Add unit tests for the new helper and for any new Zod bound.

VALIDATION
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- Manual: POST a 1 MB JSON body to /api/storefront/fitment-inquiries — expect 413, not a
  slow 400.
- Manual: upload a legitimate 4 MB JPEG through the admin product form — it must still work.
- Manual: POST a checkout with 5,000 items — expect a 400 from Zod, fast.

ACCEPTANCE CRITERIA
- Oversized JSON bodies are rejected with 413 before being fully buffered.
- The 5 MB image upload path still works end to end.
- Every public-input array and free-text string has an explicit maximum.

DO NOT
- Do not lower the image upload limit below 5 MB — the admin forms depend on it.
- Do not add a body-parsing library.
- Do not apply the JSON ceiling to the multipart upload route.
- Do not create a new top-level directory for one helper.

FINAL REPORT
Report: the two Caddy limits and the app-level ceiling; which routes were wired up; which
Zod schemas gained bounds; the three manual test results; that Caddy needs a reload on the
VPS.
```

---

## Phase 2 — Order, inventory & money correctness

### ORD-001

```text
TASK ID: ORD-001
TITLE: Checkout idempotency — stop duplicate orders and double stock decrements
PRIORITY: P0
PREREQUISITES: none

CONTEXT
Top Oil's checkout is POST /api/storefront/orders -> server/order.ts
`createStorefrontOrder`. It is well built in every other respect: all pricing is
recomputed server-side, and stock is decremented inside a prisma.$transaction with a
conditional `inventory.updateMany({ where: { productId, stock: { gte: quantity } } })`
so two concurrent checkouts cannot both take the last unit.

But there is no idempotency key. Submitting the same checkout twice — a double-clicked
button, a retried request on a flaky mobile connection, a browser back-and-resubmit —
creates TWO orders and decrements stock TWICE. No attacker is required; this happens to
ordinary customers on ordinary networks, and it is a money and inventory bug today.

OBJECTIVE
Make checkout idempotent: the same logical submission, repeated, returns the SAME order
instead of creating a second one.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md (especially the API and Database rules).
- Read server/order.ts `createStorefrontOrder` in full, including the transaction block and
  the CheckoutRejectedError path.
- Read app/api/storefront/orders/route.ts (the POST handler and its rate limiting).
- Read lib/validation/storefront.ts `storefrontOrderCreateSchema`.
- Read lib/storefront/checkout.ts `toOrderPayload` and the client caller in
  components/storefront/checkout/ — find where the submit happens and whether the button is
  already disabled during flight.
- Read prisma/schema.prisma Order model, and note the migration conventions (every model has
  id/createdAt/updatedAt; migrations live in prisma/migrations with a timestamped folder).

IMPLEMENTATION
1. Decide the key. Recommended: a client-generated `idempotencyKey` (crypto.randomUUID())
   created ONCE when the checkout form mounts, sent in the request body, and reused on every
   retry of that same submission. Validate it as a UUID in the Zod schema. Document why this
   over a server-derived hash of the payload (a hash cannot distinguish a deliberate second
   identical order from a retry of the first).
2. Add the column: `idempotencyKey String? @unique` on Order, plus a migration. Nullable
   because existing rows have none and because an order created by any future non-checkout
   path may not have one. Follow CLAUDE.md: update schema.prisma and the migration together,
   then `pnpm prisma generate`.
3. In createStorefrontOrder:
   - Before doing any work, look up an existing Order by idempotencyKey. If found, return
     the SAME response shape the function normally returns, reconstructed from the stored
     order and its items — do not re-quote prices and do not touch inventory.
   - Create the order with the key inside the existing transaction, so the unique constraint
     is what actually enforces the guarantee under concurrency.
   - Catch the Prisma unique-violation (P2002) on that column and treat it as "someone else
     won the race" — re-read and return that order rather than erroring.
4. Client side: generate the key once per checkout attempt, keep it stable across retries,
   and reset it only after a successful order is confirmed (so a customer who deliberately
   places a second, genuinely new order gets a new key). Also disable the submit button
   while a request is in flight if it is not already.
5. Tests:
   - Unit (Vitest, following lib/storefront/checkout.test.ts style) for the reconstruction
     path: same key twice returns the same order id and does not decrement stock again.
   - A concurrency test: fire two createStorefrontOrder calls with the same key
     simultaneously; exactly one order exists afterwards and stock moved exactly once.
   - Existing checkout tests must still pass unchanged.

VALIDATION
- `pnpm prisma generate` then `pnpm test` — all green. NOTE: `pnpm test` runs against the
  DEV database by default; if 5 storefront car-route tests fail, check DATABASE_URL before
  calling it a regression.
- `pnpm lint`, `pnpm tsc --noEmit` clean.
- Migration applies cleanly to a fresh database: `pnpm prisma migrate deploy`.
- Manual: place an order, then replay the exact same POST body with curl. The second call
  must return the first order (201 or 200 — pick one and document it) and stock must be
  unchanged.
- IMPORTANT: after `pnpm prisma generate`, restart any running `next dev` — routes using the
  new field will otherwise return a bare 500.

ACCEPTANCE CRITERIA
- Replaying an identical checkout POST creates exactly one Order and decrements stock once.
- Two simultaneous requests with the same key produce exactly one Order.
- A genuinely new order (new key) is unaffected.
- The migration applies to an existing populated database without data loss.

DO NOT
- Do not change how prices are computed, or the price-hold logic in priceInEffectAt.
- Do not change the conditional stock decrement — it is correct.
- Do not remove or weaken the checkout rate limit.
- Do not introduce Redis or any external store for the key. The unique constraint IS the
  mechanism.
- Do not make idempotencyKey required on the Order model (existing rows have none).

FINAL REPORT
Report: files changed; the migration name; the key strategy and why; the replay test result
(order ids and stock before/after); the concurrency test result; anything about the client
submit path you had to change.
```

---

### ORD-002

```text
TASK ID: ORD-002
TITLE: Restore stock when an order is cancelled
PRIORITY: P0
PREREQUISITES: none

CONTEXT
Top Oil decrements inventory at order creation, inside the checkout transaction
(server/order.ts `createStorefrontOrder`). Cancellation is
PATCH /api/admin/orders/[id]/status -> server/order.ts `updateOrderStatus`, which does:

    if (!VALID_TRANSITIONS[order.status].includes(input.status)) throw ...
    return prisma.order.update({ where: { id }, data: { status: input.status } });

It writes the status and nothing else. **Cancelling an order never returns its stock.**
Every cancellation permanently destroys inventory, so the shop's stock figures drift away
from the warehouse's, silently and cumulatively. VALID_TRANSITIONS allows
PENDING -> CANCELLED and SENDING -> CANCELLED, so this is reachable from the admin UI today.

OBJECTIVE
Make cancellation return the order's items to stock, exactly once, atomically.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read server/order.ts in full: createStorefrontOrder (how stock leaves), VALID_TRANSITIONS,
  updateOrderStatus, and the Order/OrderItem shapes it returns.
- Read server/inventory.ts — particularly how it updates stock and the back-in-stock
  notification hook at line ~112 (`console.error("[notify] ...")`). Restoring stock from 0
  to a positive number may need to fire that same notification; decide deliberately and say
  which way you went and why.
- Read prisma/schema.prisma: Order, OrderItem, Inventory.
- Read app/api/admin/orders/[id]/status/route.ts.

IMPLEMENTATION
1. In updateOrderStatus, when and only when the transition is `-> CANCELLED`, wrap the
   status write and the stock restoration in a single prisma.$transaction:
   - read the order's items,
   - for each, `inventory.update({ where: { productId }, data: { stock: { increment: qty },
     lastUpdatedAt: now } })`,
   - write the status.
   The transaction is what guarantees you cannot end up with a cancelled order whose stock
   was not returned, or stock returned twice.
2. Guard against double restoration. VALID_TRANSITIONS already makes CANCELLED terminal
   (its array is empty) and the function already re-reads the order before transitioning,
   so a second cancel is rejected before it reaches the increment. VERIFY this by reading
   the code, and write a test that proves it — do not add a redundant flag column if the
   state machine already covers it.
3. Handle the missing-Inventory case: Inventory is a nullable relation on Product. Decide
   what happens if a product's inventory row was deleted after the order (create it? skip?)
   and comment the decision.
4. Decide the back-in-stock notification question from the "before changing code" step and
   implement whichever way you chose.
5. Tests (Vitest, alongside the existing order tests):
   - cancelling a PENDING order restores each line's stock by exactly its quantity;
   - a second cancel attempt is rejected and does not restore again;
   - a failed status write rolls back the stock restoration (force the failure);
   - cancelling from SENDING also restores;
   - DELIVERED cannot be cancelled (existing behaviour, assert it still holds).

VALIDATION
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- Manual, against the dev DB: place a storefront order for a product with known stock,
  note stock; cancel it in the admin panel; confirm stock returned to the original figure
  and the Inventory screen agrees.
- `pnpm test:e2e` for the orders spec if runnable (see e2e/orders.spec.ts; note a running
  `next dev` blocks Playwright, and the test DB on port 5435 may need SEED_RESET=1).

ACCEPTANCE CRITERIA
- Cancelling an order restores every line item's stock exactly once, atomically.
- Double cancellation is impossible and proven by a test.
- No other status transition changes stock.
- Existing order tests still pass.

DO NOT
- Do not change VALID_TRANSITIONS.
- Do not add a "stockRestored" boolean if the existing state machine already prevents
  double restoration — prove it with a test instead.
- Do not restore stock on any transition other than -> CANCELLED.
- Do not touch createStorefrontOrder's decrement logic.

FINAL REPORT
Report: files changed; how double-restoration is prevented and the test that proves it;
what you decided about missing Inventory rows and about the back-in-stock notification, and
why; the manual before/after stock figures.
```

---

### ORD-003

```text
TASK ID: ORD-003
TITLE: Make paymentStatus writable, with transition rules
PRIORITY: P1
PREREQUISITES: BASE-002, ORD-002

CONTEXT
Top Oil's Order model has two independent statuses by design: `status` (where the parcel is)
and `paymentStatus` (whether the money arrived) — see lib/storefront/orders.ts, which is
explicit that the two are never blended.

`status` has a working state machine (VALID_TRANSITIONS in server/order.ts) and an admin
control. `paymentStatus` has NEITHER. It is set to "UNPAID" in createStorefrontOrder and is
never written again by any code path in the repository. An order can never be marked paid.

BASE-002 recorded the payment model decision in docs-payment-decision.md. READ THAT FILE
FIRST — it answers who may change paymentStatus, which transitions are legal, what happens
on cancellation, and whether an unpaid order holds stock. This task implements that decision
for the admin-controlled case. If BASE-002 chose Model B (a PSP), the settlement path is
PAY-002's job and this task covers only the manual/admin corrections around it.

OBJECTIVE
Give paymentStatus a validated transition path and an admin control, matching the decision
already recorded in docs-payment-decision.md.

BEFORE CHANGING CODE
- Read docs-payment-decision.md — it is the specification for this task.
- Read CLAUDE.md and AGENTS.md.
- Read server/order.ts: VALID_TRANSITIONS, updateOrderStatus, updateOrderNote,
  OrderNotFoundError / InvalidOrderTransitionError.
- Read app/api/admin/orders/[id]/status/route.ts and .../note/route.ts as the pattern to
  follow — a new route must look like its neighbours.
- Read lib/validation/order.ts (orderStatusUpdateSchema, paymentStatusSchema).
- Read app/(admin)/admin/orders/[id]/page.tsx to see how the status control is rendered.
- Read the Orders frame in top-oil.excalidraw if the admin order detail screen is drawn
  there — CLAUDE.md's Wireframe Rules apply, so do not invent UI the frame does not show.
  If the frame does not cover a payment control, follow the existing status control's
  pattern exactly and add nothing else.

IMPLEMENTATION
1. Add VALID_PAYMENT_TRANSITIONS to server/order.ts, mirroring VALID_TRANSITIONS in shape
   and comment style, populated from docs-payment-decision.md's answer to question 3b.
2. Add `updatePaymentStatus(id, input)` in server/order.ts using the same
   read-check-transition-write pattern as updateOrderStatus. If BASE-002 decided that
   cancellation forces a paymentStatus change, implement that inside ORD-002's cancellation
   transaction rather than as a separate write.
3. Add PATCH /api/admin/orders/[id]/payment/route.ts, modelled exactly on the existing
   status route: requireAdmin(), Zod-validate the body and the path param, map
   OrderNotFoundError -> 404 and InvalidOrderTransitionError -> 409 (match whatever the
   status route already does — consistency matters more than the specific code).
4. Add the admin control to the order detail screen, using the same shared components the
   status control uses. No new bespoke UI.
5. Tests: the transition matrix (every legal and illegal pair), 404 for a missing order,
   401 for a non-admin, and that changing paymentStatus does not change `status`.

VALIDATION
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- `pnpm build` succeeds (a new route file changes the route manifest).
- Manual: mark an order PAID in the admin panel; confirm the storefront order-history screen
  and the customer order detail show the new payment status with the correct bilingual label
  (paymentStatusLabel in lib/storefront/orders.ts) in both /en and /fa.

ACCEPTANCE CRITERIA
- paymentStatus can be changed by an admin, only along transitions declared legal in
  docs-payment-decision.md.
- Illegal transitions are rejected with the same error shape as illegal status transitions.
- The route requires ADMIN and validates every input.
- The two statuses remain independent — neither write touches the other.

DO NOT
- Do not blend the two statuses into one field or derive one from the other.
- Do not let a customer-facing route change paymentStatus.
- Do not implement PSP callbacks here — that is PAY-002.
- Do not invent admin UI beyond what the existing status control's pattern implies.

FINAL REPORT
Report: the transition matrix implemented and which line of docs-payment-decision.md it came
from; files changed; the new route's error codes; tests added; the bilingual label check.
```

---

### ORD-004

```text
TASK ID: ORD-004
TITLE: Add the missing Order indexes
PRIORITY: P1
PREREQUISITES: none

CONTEXT
Top Oil's Prisma schema has a migration named 20260811110315_index_foreign_keys that indexed
twelve foreign keys across Product, CarModel, CarEngine, FitmentProfileItem, FitmentInquiry
and OrderItem. It missed Order entirely.

Today `Order` has NO index of any kind beyond its primary key. Two query paths suffer:
  - server/order.ts `listCustomerOrders` / `getCustomerOrderById` filter on customerId —
    an unindexed foreign key, and the one backing every customer's order history.
  - server/order.ts `listOrders` (the admin Orders screen) filters on status, paymentStatus
    and a createdAt range, and always sorts `createdAt desc` with LIMIT/OFFSET paging.
It is fast now only because the table is nearly empty. At ~150 orders/day it becomes a
sequential scan plus a sort on every admin page load.

OBJECTIVE
Add exactly the indexes these queries need — no more — and prove with EXPLAIN that the
planner uses them.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md (Database rules).
- Read prisma/schema.prisma: the Order and OrderItem models, and the index comments on
  Product and CarEngineFitmentProfile — they explain WHY each existing index exists, and a
  new one is expected to carry the same kind of comment.
- Read prisma/migrations/20260811110315_index_foreign_keys/migration.sql as the format to
  follow.
- Read server/order.ts `listOrders`, `listCustomerOrders`, `getCustomerOrderById`.
- If PERFORMANCE-BASELINE.md exists (BASE-001), read its EXPLAIN section first.

IMPLEMENTATION
1. Add to the Order model, each with a one-line comment naming the query it serves:
   - @@index([customerId]) — the FK the earlier migration missed; backs a customer's history.
   - @@index([createdAt]) — the admin list's default sort.
   - A composite for the admin list's common filter+sort. Think about column order before
     writing it: for `WHERE status = ? ORDER BY createdAt DESC`, the equality column comes
     first — @@index([status, createdAt]). Decide whether paymentStatus deserves its own or
     whether it is too low-cardinality to help, and say which and why in the comment. Do not
     add an index per enum value combination.
2. Seed a realistic dataset to test against — a few thousand orders — using a throwaway
   script under scripts/ or a Vitest fixture. Do NOT commit a script that can run against a
   real database without an explicit flag; note that prisma/seed.ts already refuses to run
   against a populated database unless SEED_RESET=1, and that guard exists because a seed
   destroyed hand-entered data once. Respect the same discipline.
3. Capture EXPLAIN ANALYZE for the admin list query and the customer history query BEFORE
   and AFTER the indexes, at that dataset size. Paste both into the final report.
4. Generate the migration and confirm it applies to an existing populated database.
   Remember `pnpm prisma generate` afterwards, and restart any running `next dev`.

VALIDATION
- `pnpm prisma migrate deploy` applies cleanly to a fresh database and to a populated one.
- `pnpm prisma generate` then `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- EXPLAIN ANALYZE shows an Index Scan (not a Seq Scan) for both queries after the change.
- The admin Orders screen still paginates, filters and sorts identically — this is a pure
  performance change with no behaviour change.

ACCEPTANCE CRITERIA
- Order.customerId is indexed.
- The admin list's filter+sort is served by an index, proven by EXPLAIN.
- No index was added that no query uses.
- Every new index carries a comment naming its query, matching the schema's existing style.

DO NOT
- Do not add indexes speculatively "for later".
- Do not change any query in server/order.ts — this task only adds indexes.
- Do not commit the load-generation script in a form that can run against production data.
- Do not touch the seed guard in prisma/seed.ts.

FINAL REPORT
Report: the indexes added and the query each serves; the before/after EXPLAIN ANALYZE output
for both queries; the dataset size tested at; the migration name; confirmation the admin
Orders screen behaves identically.
```

---

## Phase 3 — Reliability

### REL-001

```text
TASK ID: REL-001
TITLE: Health endpoint and container hardening
PRIORITY: P1
PREREQUISITES: none

CONTEXT
Top Oil runs as one Docker container (`app`) plus `postgres` and a one-shot `migrate`
service, defined in docker-compose.prod.yml, on a shared Ubuntu VPS behind a host Caddy.

Gaps, all verified:
  - There is no health endpoint anywhere in the app. Nothing can answer "is it up?".
  - The `postgres` service HAS a healthcheck (pg_isready); the `app` service has NONE.
    `restart: unless-stopped` restarts a crashed process but does nothing for a hung one,
    one that lost its database pool, or one that boots and serves 500s.
  - No memory or CPU limits on either service. The VPS is SHARED with other sites, so a
    runaway container is a problem for the neighbours, not just for Top Oil —
    DEPLOYMENT.md §1 makes that constraint explicit and it is load-bearing.
  - No logging driver configuration, so Docker's json-file log grows without bound until
    the disk fills.
  - No stop_grace_period, so a redeploy can cut an in-flight checkout.

OBJECTIVE
Add a health endpoint, wire it into a container healthcheck, and bound the container's
resource and log usage.

BEFORE CHANGING CODE
- Read CLAUDE.md, AGENTS.md, and DEPLOYMENT.md (all of §0, §1 and §4 — the shared-VPS
  constraints are the whole reason the limits matter).
- Read docker-compose.prod.yml in full, including its header comment about why nothing binds
  a public port and why `name: topoil` is pinned.
- Read Dockerfile (the `runner` stage — note it is a slim standalone image with no Prisma
  CLI and no curl/wget necessarily present; check what IS available before writing a
  healthcheck command).
- Read lib/db.ts for how the Prisma client is constructed.
- Read an existing simple route handler, e.g. app/api/storefront/settings/route.ts, for the
  response-envelope convention: { success: true, data } / { success: false, error }.

IMPLEMENTATION
1. Add app/api/health/route.ts:
   - Fast, unauthenticated, and CHEAP. It must not become a way to make the server work.
   - Two levels: a liveness answer that only proves the process responds, and a readiness
     answer that also does a trivial DB round-trip (`SELECT 1` via prisma.$queryRaw, or a
     cheap count with a short timeout). Decide whether to expose both as one endpoint with
     a query flag or two endpoints, and say why.
   - Return 200 when healthy, 503 when the DB check fails. Body follows the project envelope.
   - Leak nothing: no version strings, no connection strings, no error details, no row
     counts. A failure returns { success: false, error: "unhealthy" } and the detail goes to
     the log, not the response.
   - Mark it `export const dynamic = "force-dynamic"` so it is never cached.
   - Rate-limit it or keep the DB check trivial — it is public.
2. Add a healthcheck to the `app` service in docker-compose.prod.yml pointing at the
   readiness endpoint. The runner image is node:22-alpine with the standalone server;
   if curl/wget are absent, use `node -e` with a fetch — verify which works in the actual
   image rather than guessing. Set sensible interval/timeout/retries/start_period (the
   Next standalone server needs a few seconds to boot).
3. Add `deploy.resources.limits` (or the `mem_limit`/`cpus` short form, whichever this
   Compose version honours in non-swarm mode — check and use the one that actually applies)
   for both `app` and `postgres`. Pick numbers from the VPS's actual capacity as recorded in
   DEPLOYMENT.md §1, and comment the reasoning. Being a good neighbour is the point.
4. Add a `logging` block to both services: json-file driver, max-size and max-file, so logs
   rotate instead of filling the disk.
5. Add `stop_grace_period` to `app` so an in-flight request can finish on redeploy.
6. Update DEPLOYMENT.md: document the health endpoint URL, how to check it from the VPS,
   what the limits are and why, and add the health check to the §5.4 "Confirm" steps.

VALIDATION
- `pnpm build && pnpm start`, then `curl -i localhost:3000/api/health` returns 200.
- Stop the local database (`docker compose stop db`) and confirm the readiness check
  returns 503 and the liveness check still returns 200.
- `docker compose -f docker-compose.prod.yml config` parses without error.
- Build the runner image and confirm the healthcheck command actually exists in it:
  `docker run --rm --entrypoint sh topoil-app:latest -c "command -v wget || command -v curl"`
  or equivalent — do not ship a healthcheck that silently always fails.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.

ACCEPTANCE CRITERIA
- /api/health returns 200 when healthy and 503 when the database is unreachable.
- The health response discloses no internal detail.
- `docker compose config` is valid and the healthcheck command is proven to exist in the
  runner image.
- Both services have memory limits and log rotation.
- DEPLOYMENT.md documents all of it.

DO NOT
- Do not expose version numbers, migration state, environment variables or row counts.
- Do not make the health check expensive — no catalog queries, no counts over Product.
- Do not add a healthcheck to the one-shot `migrate` service (it exits by design).
- Do not bind any new port to a public interface.
- Do not add monitoring or alerting here — that is OBS-002.

FINAL REPORT
Report: the endpoint's shape and status codes; the healthcheck command and proof it exists
in the image; the resource limits chosen and the reasoning; the DB-down test result; the
DEPLOYMENT.md sections updated.
```

---

### REL-002

```text
TASK ID: REL-002
TITLE: Error and not-found boundaries
PRIORITY: P1
PREREQUISITES: none

CONTEXT
Top Oil has TWO independent root layouts by design: app/(admin)/layout.tsx (English/LTR,
always) and app/[locale]/layout.tsx (per-locale lang/dir, light/dark theme). CLAUDE.md is
explicit that there is deliberately no shared app/layout.tsx and that reintroducing one
would make the nested <html> invalid.

There is currently NO error.tsx, NO global-error.tsx and NO not-found.tsx anywhere under
app/. Verified by find. So:
  - A Prisma failure while rendering a PDP shows Next's default unstyled error page — in
    LTR, in English, on a Persian storefront, with no way back to the shop.
  - app/[locale]/layout.tsx calls notFound() for an invalid locale segment, which currently
    renders Next's built-in 404 rather than a Top Oil page.
  - Admin screens have the same problem with a different audience.

OBJECTIVE
Add branded, theme-aware, locale-aware error and not-found boundaries to both trees, so no
failure escapes to Next's defaults.

BEFORE CHANGING CODE
- Read CLAUDE.md (Folder Structure and Styling sections — especially the semantic token
  rules: paint from bg-surface / text-fg / border-line etc., never a raw Tailwind step, or
  the dark theme breaks) and AGENTS.md.
- Read app/[locale]/layout.tsx and app/(admin)/layout.tsx in full.
- Read app/globals.css's token block comment before using any colour.
- Read lib/i18n/index.ts (pickLocale, localeDir) and components/storefront/nav-items.ts.
- Look at an existing storefront page and an existing admin page for the composition style
  to match.
- Note: error.tsx and global-error.tsx MUST be Client Components ("use client"). Be careful
  with the project's known hazard that a `const` exported from a "use client" module and
  imported into a Server Component becomes a stringified stub — keep the boundaries
  self-contained.

IMPLEMENTATION
1. app/[locale]/error.tsx — storefront error boundary. Client Component. Bilingual (read the
   locale from the route params or the existing i18n hook, whichever the codebase already
   uses in client components), theme-aware via semantic tokens, with a "try again" button
   wired to the `reset` prop and a link back to the storefront home. Must render correctly
   in RTL.
2. app/[locale]/not-found.tsx — storefront 404. Same treatment. Must handle the case
   app/[locale]/layout.tsx triggers (invalid locale) as well as a missing product/category.
3. app/(admin)/error.tsx and app/(admin)/not-found.tsx — English/LTR, light only (the admin
   has no dark theme, per CLAUDE.md), matching the admin shell's visual language.
4. A global-error.tsx — this one catches failures in a root layout itself, so it must render
   its own <html> and <body> and cannot rely on either layout's styling. Keep it minimal and
   dependency-free; inline the few styles it needs. Decide where it goes given there are two
   root layouts and explain the choice in a comment.
5. In every boundary: display a short, non-technical message and NOTHING from the error
   object. Do not render `error.message`, stack traces, or the digest to the user. Log the
   error to the console (REL-003 will replace that with structured logging).
6. Verify contrast and focus states on the new pages, per CLAUDE.md's Code Quality rules.

VALIDATION
- `pnpm build` succeeds.
- Force a storefront error (temporarily throw in a page component) and confirm the branded
  boundary appears in /fa (RTL, correct font) and /en, in both light and dark themes.
- Visit /fa/products/does-not-exist and /fa/../nonsense-locale and confirm the 404 renders.
- Force an admin error and confirm the admin boundary appears, LTR and light.
- Confirm no error message, stack or digest is visible in the rendered HTML (view source).
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.
- Revert the temporary throws.

ACCEPTANCE CRITERIA
- Both trees have error and not-found boundaries; a global-error exists.
- Storefront boundaries are bilingual, RTL-correct and theme-aware.
- Admin boundaries are English/LTR/light.
- No technical detail from the error object reaches the browser.
- All colours come from the semantic tokens, so the dark theme flips correctly.

DO NOT
- Do not create a shared app/layout.tsx.
- Do not render error.message, error.stack or error.digest to the user.
- Do not use raw Tailwind colour steps (text-neutral-500, bg-white) — they will not flip.
- Do not add a dark theme to the admin tree.
- Do not add an error-reporting SDK here — that is REL-004.

FINAL REPORT
Report: files added; how the storefront boundary gets its locale; where global-error lives
and why; the four forced-error results (fa light, fa dark, en, admin); confirmation that no
error detail is in the HTML.
```

---

### REL-003

```text
TASK ID: REL-003
TITLE: Structured logging and request IDs
PRIORITY: P1
PREREQUISITES: none

CONTEXT
Top Oil has, in its entire application code, exactly ONE logging statement:
server/inventory.ts line ~112, `console.error("[notify] back-in-stock alert failed ...")`.
Plus one console.info in lib/notify.ts's placeholder sender.

There is no structured logging, no request correlation, and no error output at all from the
~58 route handlers — several of which deliberately `throw` for unexpected errors and let
Next turn them into a 500. In production, on a shared VPS with no monitoring, a failure is
completely invisible until a customer telephones.

This task builds the seam that REL-004 (error tracking), OBS-001 (audit log) and OBS-002
(alerting) all plug into. It comes before them for that reason.

OBJECTIVE
Introduce a minimal structured logger, give every request a correlation id, and log the
things that matter — without adding a logging framework or a dependency.

BEFORE CHANGING CODE
- Read CLAUDE.md (Core Principles: prefer simplicity, avoid over-engineering, every folder
  and file must have a clear purpose) and AGENTS.md.
- Read server/inventory.ts around line 112 and lib/notify.ts for the existing style.
- Read proxy.ts — it runs on the edge, has no Prisma, and is where a request id can be
  minted and attached before anything else sees the request.
- Read three or four route handlers to see the shared response-envelope and try/catch shape:
  app/api/storefront/orders/route.ts, app/api/admin/products/route.ts,
  app/api/admin/upload/route.ts.
- Read docker-compose.prod.yml to confirm logs go to stdout and are collected by Docker's
  json-file driver (REL-001 may have added rotation).

IMPLEMENTATION
1. Add a small logger — suggested lib/log.ts, a single file, no dependency. It emits one
   JSON object per line to stdout (`console.log(JSON.stringify(...))`) with: timestamp,
   level, message, requestId when available, and a bounded set of structured fields.
   In development, a readable one-line format is fine; make the switch explicit and simple.
   Resist building a framework — this should be well under 100 lines.
2. Mint a request id in proxy.ts (crypto.randomUUID()) and attach it as a request header so
   route handlers and server components can read it. Note that proxy.ts's `matcher` is
   currently narrow (only "/", /admin/*, and the protected account paths) — widening it to
   every route has a cost on every request. Decide deliberately: either widen the matcher,
   or generate the id in the route handlers themselves, and explain the trade-off you chose.
3. REDACTION IS THE POINT OF THIS TASK. The logger must never emit: passwords or
   passwordHash, the JWT or the session cookie, JWT_SECRET or any env value, a customer's
   full phone number or email (log a hash or a masked form if you need to correlate), a full
   shipping address, or a request body wholesale. Write this as an explicit allowlist of
   loggable fields, not a denylist — and add a unit test that feeds the logger an object
   containing a password and a token and asserts neither appears in the output.
4. Log, at minimum:
   - every unhandled error escaping a route handler, with the request id, route, method and
     status — replace bare `throw` re-raises with log-then-throw where it does not change
     behaviour;
   - every 4xx that indicates abuse rather than a typo: 401 on admin routes, 403, 429;
   - checkout outcomes (order created / CheckoutRejectedError) with the order id, WITHOUT
     the customer's contact details;
   - the two existing console calls, converted to the new logger.
5. Do NOT log every successful request. On a shared VPS that is disk-fill by another name;
   Caddy already has an access log if one is needed.

VALIDATION
- `pnpm test` — including the new redaction test.
- `pnpm lint`, `pnpm tsc --noEmit` clean.
- `pnpm build && pnpm start`, then trigger: a 404, a 401 on an admin API route, a 429 by
  tripping the login limiter, and a forced 500. Confirm each produces exactly one structured
  line with a request id, and that the same request id appears on both the log line and (if
  you chose to expose it) the response header.
- grep the captured output for "password", "Bearer", the cookie name and a test phone
  number — none may appear.

ACCEPTANCE CRITERIA
- One JSON line per logged event, with a request id.
- A redaction test exists and passes.
- Unhandled route errors, auth failures and rate-limit trips are logged.
- No successful-request spam.
- No secret, credential or customer PII appears in any log line.

DO NOT
- Do not add pino, winston, or any logging dependency. Console + JSON.stringify is enough
  for one container writing to Docker's json-file driver.
- Do not log request or response bodies wholesale.
- Do not log the session cookie or any JWT, not even truncated.
- Do not add log shipping or an external sink — that is REL-004/OBS-002.
- Do not change any route's behaviour or response shape.

FINAL REPORT
Report: the logger's shape; where the request id is minted and the trade-off you chose in
step 2; the exact allowlist of loggable fields; the four triggered log lines (redacted
sample); the grep results proving nothing sensitive leaked.
```

---

### REL-004

```text
TASK ID: REL-004
TITLE: Error tracking
PRIORITY: P2
PREREQUISITES: REL-003

CONTEXT
Top Oil now emits structured JSON logs to stdout with request ids (REL-003), collected by
Docker's json-file driver on a shared Ubuntu VPS. That is enough to investigate a problem
you already know about; it is not enough to LEARN about one. Nobody reads container logs.

IMPORTANT CONSTRAINT: this is an Iranian site (oil-top.ir) on an Iranian VPS. Sentry's SaaS,
and most Western observability vendors, are not reliably reachable from Iranian
infrastructure and may be blocked at either end. An integration that silently stops working
is worse than none. Any solution must be either self-hosted or verified reachable from the
actual VPS before it is adopted.

OBJECTIVE
Get application errors in front of a human, using something that will still work in six
months from this network.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read lib/log.ts (from REL-003) and the boundaries from REL-002.
- Read DEPLOYMENT.md §0 and §1 — the VPS is shared and its resources are constrained; a
  self-hosted stack must be sized accordingly, and DEPLOYMENT.md §1's "one way this deploy
  can hurt the neighbours" section is the constraint to respect.
- Read docker-compose.prod.yml — anything added here becomes another container on a shared
  box.

IMPLEMENTATION
1. First, evaluate and RECORD the options rather than picking one blind:
   a. Self-hosted GlitchTip (Sentry-compatible, small footprint) as an extra compose service
      — costs RAM on a shared box.
   b. Self-hosted GlitchTip/Sentry on a DIFFERENT machine the operator controls, with the
      app reporting to it — no cost to this VPS.
   c. No error-tracking service at all: a log-scanning cron on the VPS that greps the
      container's json-file log for level:"error" since the last run and sends a digest
      (email/SMS/Telegram — whatever the operator can actually receive in Iran).
   Option (c) is the honest default for this project's size. Do not dismiss it because it is
   unfashionable; it has no new dependency, no new container and cannot be blocked.
2. Confirm reachability before committing to (a) or (b): from the VPS, verify the endpoint
   responds. If it cannot be verified in this session, say so and implement (c), noting what
   would need to be checked to move to (a)/(b) later.
3. Implement the chosen option:
   - If a reporting SDK is used, initialise it in ONE place, gate it on an env var so a
     missing DSN disables it cleanly rather than throwing, and make sure a reporting failure
     can never fail a request (fire-and-forget, wrapped).
   - Apply REL-003's redaction allowlist to whatever is sent. An error tracker that receives
     a request body receives customer addresses and phone numbers.
   - Wire it into the REL-002 error boundaries and the REL-003 unhandled-error path.
4. Add the env var to .env.production.example with a comment, never a real value.
5. Document in DEPLOYMENT.md: what it is, where alerts arrive, and how to turn it off.

VALIDATION
- `pnpm build`, `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.
- With the feature disabled (env var unset), the app behaves exactly as before — prove it.
- With it enabled, force an error and confirm it arrives at the destination.
- Confirm a deliberately unreachable destination does NOT slow down or fail a request.

ACCEPTANCE CRITERIA
- Errors reach a human without anyone reading a container log.
- The mechanism is verified reachable from Iranian infrastructure, or is option (c).
- A missing/unreachable destination degrades silently and never affects a response.
- No PII or secret is transmitted.

DO NOT
- Do not adopt a SaaS error tracker without verifying it is reachable from the VPS.
- Do not let error reporting run in the request's critical path.
- Do not send request bodies, cookies or headers wholesale.
- Do not add a heavy observability stack (Prometheus + Grafana + Loki) to a shared VPS.
- Do not put a DSN or key in the repo.

FINAL REPORT
Report: the three options as evaluated, the one chosen and why; reachability evidence; the
env var added; the forced-error result; proof that a dead destination does not affect
requests.
```

---

### REL-005

```text
TASK ID: REL-005
TITLE: Database pool sizing and graceful shutdown
PRIORITY: P2
PREREQUISITES: REL-001

CONTEXT
Top Oil constructs its Prisma client in lib/db.ts:

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    export const prisma = globalThis.prismaClient ?? new PrismaClient({ adapter, omit: {...} });

No pool size is configured, so node-postgres's default applies (max 10 connections per
process). PostgreSQL 16's default max_connections is 100. With one app container that is
comfortable — but it is comfortable by accident, not by decision, and nothing documents it.

Separately, the container has no explicit shutdown handling. Next's standalone server
handles SIGTERM reasonably, but nothing drains in-flight requests deliberately, and
REL-001 may have added a stop_grace_period that nothing is currently using.

OBJECTIVE
Make the connection pool an explicit, documented decision, and confirm (or fix) shutdown
behaviour so a redeploy cannot cut an in-flight checkout.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read lib/db.ts in full, including the comments about the dev hot-reload global and the
  `omit` block (sourceRef and finalPrice are omitted globally for reasons documented there
  — do not disturb that).
- Read prisma.config.ts and .env.production.example.
- Read docker-compose.prod.yml (post-REL-001) — the postgres service's configuration and
  the app's stop_grace_period.
- Read PERFORMANCE-BASELINE.md (BASE-001) for the measured concurrency, if it exists.

IMPLEMENTATION
1. Set the pool size explicitly in lib/db.ts via PrismaPg's options, with a comment stating
   the arithmetic: (app instances) × (pool max) must stay comfortably below Postgres's
   max_connections, leaving room for the migrate container, psql sessions and backups.
   Pick a number from the measured concurrency in BASE-001 rather than a round guess, and
   write down what would need to change if a second app instance is ever added.
2. Set a connection timeout and a statement/query timeout so a stuck query cannot hold a
   connection forever. Decide the values from the baseline's slowest observed query, with
   headroom, and comment them.
3. Verify shutdown behaviour empirically: start the production build, begin a slow request,
   send SIGTERM, and observe whether the in-flight request completes or is cut. Record the
   result. Only add explicit signal handling if the observed behaviour is wrong — Next may
   already do the right thing, and adding a handler that fights it is worse than nothing.
4. If Postgres's own settings need adjusting (max_connections, shared_buffers) for the VPS's
   RAM, do that in docker-compose.prod.yml with a comment — but only if the measurement in
   step 1 says it is needed. The default is very likely fine.
5. Document the pool arithmetic in DEPLOYMENT.md so the next person who scales the app knows
   what number to change.

VALIDATION
- `pnpm build && pnpm start`; confirm the app connects and serves normally.
- Generate concurrent load (the k6 script from LOAD-001 if it exists, otherwise autocannon)
  and confirm no "too many connections" or pool-timeout errors appear.
- Check actual connection count during load:
  `docker compose exec db psql -U <user> -d topoil -c "select count(*) from pg_stat_activity;"`
- The SIGTERM test from step 3, with the result recorded.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.

ACCEPTANCE CRITERIA
- The pool size is set explicitly and the arithmetic behind it is written down.
- Query and connection timeouts are set.
- Observed connections under load stay within the configured ceiling.
- Shutdown behaviour is verified; in-flight requests are not cut on redeploy.

DO NOT
- Do not add PgBouncer or any external pooler.
- Do not change the `omit` configuration in lib/db.ts.
- Do not remove the dev hot-reload global — it exists to stop `next dev` exhausting
  connections on every file save.
- Do not add signal handling if the measurement shows Next already handles it correctly.

FINAL REPORT
Report: the pool size and timeouts chosen and the arithmetic; the observed connection count
under load; the SIGTERM test result and whether you added a handler; what you documented in
DEPLOYMENT.md.
```

---

## Phase 4 — Performance & caching

### PERF-001

```text
TASK ID: PERF-001
TITLE: Cache the sitemap and robots.txt
PRIORITY: P1
PREREQUISITES: none

CONTEXT
app/sitemap.ts is declared `export const dynamic = "force-dynamic"`. On EVERY request it
runs four unpaginated queries (listSitemapProducts, listSitemapCategories,
listSitemapCarBrands, listSitemapCarModels in lib/services/sitemap.ts) and then materializes
roughly 8,000 URL entries — two locales × (~3,469 products + ~561 car models + 81 car brands
+ categories + static paths), each one built through `localizedEntries`.

It is public, uncached, unauthenticated and not rate-limited. A loop over
`curl https://oil-top.ir/sitemap.xml` will saturate the box long before the catalog pages
will. It is the cheapest denial-of-service in the application.

app/robots.ts is also force-dynamic, for the same stated reason (it reads a Settings toggle).

The existing comment explains the force-dynamic choice honestly: catalog rows and the
Settings toggle both change without a deploy. That reasoning is sound; the conclusion is
too strong. A crawler does not need second-level freshness.

OBJECTIVE
Serve both files from cache with a bounded revalidation window, keeping the "changes without
a deploy" property that the force-dynamic was protecting.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read app/sitemap.ts and app/robots.ts in full, including the comments explaining
  force-dynamic — you are changing a documented decision and must update the comment to say
  what replaced it and why.
- Read lib/services/sitemap.ts (the four queries) and lib/storefront/sitemap.ts.
- Read server/setting.ts `isSitemapEnabled` — the toggle both files honour.
- Read app/[locale]/layout.tsx's `export const revalidate = 300` for the precedent this
  project already set for a Settings-driven cached page, and match its reasoning.
- If PERFORMANCE-BASELINE.md exists, read the /sitemap.xml timing.

IMPLEMENTATION
1. Replace `dynamic = "force-dynamic"` with a time-based revalidation on both files. Pick a
   window with a stated justification — an hour is defensible for a sitemap; the layout
   already uses 300s for settings-driven content. Whatever you choose, the comment must say
   why that number, not just what it is.
2. Confirm the Settings toggle still takes effect within the window and that disabling it
   still yields a valid empty sitemap rather than a 404 (the current comment explains why
   empty-not-404 matters — preserve that behaviour exactly).
3. Consider whether the sitemap should be split. Next supports generateSitemaps() for
   multiple sitemap files, and search engines cap a single sitemap at 50,000 URLs / 50 MB.
   At ~8,000 entries this is not yet required — so DECIDE and RECORD that it is not required
   yet, with the number that would trigger it. Do not split it now.
4. Bound the queries defensively: confirm each of the four returns only ACTIVE rows and
   selects only the columns the sitemap uses (slug, updatedAt). If any of them selects more,
   narrow it — that is a straight win independent of caching.
5. Re-measure /sitemap.xml cold and warm and record both.

VALIDATION
- `pnpm build && pnpm start`.
- `curl -w "%{time_total}" -o /dev/null -s localhost:3000/sitemap.xml` twice — the second
  must be dramatically faster than the first.
- The sitemap's content is byte-identical to before the change (diff the two outputs) —
  this is a caching change with no output change.
- Toggle the sitemap Setting off in the admin panel; confirm that within the revalidation
  window the sitemap becomes empty and robots.txt stops linking to it.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.

ACCEPTANCE CRITERIA
- Neither file is force-dynamic.
- Warm response time is at least an order of magnitude better than cold; both recorded.
- Output is byte-identical to the previous implementation.
- The Settings toggle still works, within the documented window.
- The comments explain the new choice, not the old one.

DO NOT
- Do not split the sitemap into multiple files yet.
- Do not change which URLs appear, their priorities, or their changeFrequency values.
- Do not remove the empty-sitemap-instead-of-404 behaviour.
- Do not introduce Redis or an external cache.
- Do not touch app/[locale]/layout.tsx's revalidate.

FINAL REPORT
Report: the revalidation window chosen and the justification; before/after cold and warm
timings; proof the output is unchanged (diff result); the toggle test result; the URL count
that would force a sitemap split later.
```

---

### PERF-002

```text
TASK ID: PERF-002
TITLE: Cache catalog reads and invalidate them on admin write
PRIORITY: P1
PREREQUISITES: BASE-001

CONTEXT
Top Oil's storefront pages all render dynamically today, because they read `searchParams`:
app/[locale]/products/page.tsx (PLP), app/[locale]/products/[slug]/page.tsx (PDP),
app/[locale]/categories/[slug]/page.tsx and the fitment results page. Each render performs
several Prisma queries via lib/services/catalog.ts and lib/services/fitment.ts. There is no
caching layer of any kind.

Per PERFORMANCE-BASELINE.md and the scale analysis, these three page types are ~95% of
storefront traffic, and Node CPU rendering uncached React is the system's actual bottleneck
— not the database, and not order writes (which peak at under one per minute).

The PDP is the best candidate: its URL is /[locale]/products/[slug], and the `?fit=` query
parameter is deliberately context-only and never changes which product is shown (Design
Decision 5 — the URL stays car-agnostic). Read that comment before assuming the search
params make caching impossible.

OBJECTIVE
Cache the catalog reads behind these pages, with explicit invalidation when an admin changes
the underlying data, so a price edit is visible promptly rather than after a timeout.

BEFORE CHANGING CODE
- Read PERFORMANCE-BASELINE.md first — it says which pages are actually slow.
- Read CLAUDE.md (Performance section) and AGENTS.md.
- Read the four page files above IN FULL, including their header comments explaining why
  they fetch from lib/services/* directly rather than through their own HTTP API.
- Read lib/services/catalog.ts (listStorefrontProducts, getStorefrontProductBySlug,
  listActiveCategories, listActiveProductBrands) and lib/services/fitment.ts.
- Read app/[locale]/layout.tsx's `revalidate = 300` — the precedent.
- Read the admin write paths that must invalidate: app/api/admin/products/[id]/route.ts,
  app/api/admin/products/route.ts, app/api/admin/categories/*, app/api/admin/brands/*,
  app/api/admin/inventory/[productId]/route.ts.
- Check the Next 16 caching API actually available in this version before designing around
  it (cacheTag/cacheLife vs unstable_cache vs revalidateTag) — do not write to an API that
  does not exist here.

IMPLEMENTATION
1. Decide the cache boundary and write it down before coding. Recommended: cache the
   SERVICE functions in lib/services/catalog.ts (tagged per entity), not the pages —
   the pages legitimately vary by searchParams, the data underneath does not.
2. Tag scheme: define it once, in one place, as constants — e.g. a product tag keyed by
   slug, a catalog-wide tag, a category tag, a brand tag. Every cached read declares its
   tags; every admin write revalidates exactly the tags it invalidates. Write the mapping
   down as a comment or a small table in the file, because getting it wrong shows customers
   stale prices.
3. INVENTORY IS THE HARD CASE. Stock changes on every checkout, not just on admin edits.
   Decide deliberately: either exclude stock from the cached read and fetch it fresh (the
   safer choice — a cached "in stock" on a sold-out product causes a rejected checkout and
   a bad experience), or cache it with a very short window. Whichever you choose, state the
   reasoning in a comment. Do NOT cache stock for minutes.
4. PRICE IS THE OTHER HARD CASE. server/order.ts recomputes every price at checkout, so a
   stale cached price cannot cause a wrong charge — but it can cause a visible price change
   between the cart and the confirmation. Confirm how ProductPriceLog's 24-hour hold
   interacts with a cached price and make sure the caching does not defeat it.
5. Wire revalidation into the admin write routes. Keep it at the route-handler edge, after
   a successful write, not inside server/ — those functions are also called by scripts and
   the importer, where revalidation is meaningless.
6. Re-measure the same paths BASE-001 measured, and compare.

VALIDATION
- `pnpm build && pnpm start`.
- Measure PLP, PDP and category pages cold and warm; compare against PERFORMANCE-BASELINE.md
  and record the delta.
- Correctness, and this is the part that matters more than the speed:
  - edit a product's price in the admin panel -> reload the PDP -> the new price is visible
    immediately, not after a timeout;
  - deactivate a product -> it disappears from the PLP and its PDP 404s;
  - place an order that takes the last unit -> the PDP shows out-of-stock promptly;
  - edit a category name -> the category page and the PLP filter rail both update.
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- `pnpm test:e2e` — the storefront-shop and catalog specs are the regression net here.

ACCEPTANCE CRITERIA
- PLP, PDP and category pages are measurably faster warm than cold, with figures recorded.
- All four correctness checks above pass.
- Stock never shows a stale "in stock" for a sold-out product.
- The tag scheme is documented in one place.

DO NOT
- Do not introduce Redis or any external cache. Next's own cache is sufficient for one
  container.
- Do not cache anything that varies per user — order history, the profile page, /api/auth/me.
- Do not cache admin routes or any /api/admin/* response.
- Do not cache stock for more than a few seconds.
- Do not change what the pages render — this is a performance change only.
- Do not move data fetching from lib/services/* into the API routes; the pages call the
  services directly on purpose (see their header comments).

FINAL REPORT
Report: where the cache boundary was placed and why; the full tag scheme; how stock and
price were handled and the reasoning; before/after timings for all three page types; the
four correctness check results; E2E outcome.
```

---

### PERF-003

```text
TASK ID: PERF-003
TITLE: Image and static asset delivery
PRIORITY: P2
PREREQUISITES: PERF-002

CONTEXT
Top Oil serves product, category, brand and car images from two places: /public (committed
assets) and /public/uploads (admin uploads, stored on the `uploads` Docker volume and
written by server/upload.ts). Caddy proxies everything to the Next server; there is no CDN
and no cache-control tuning beyond Next's defaults.

CLAUDE.md is specific about the visual contract, and it constrains what may change here:
product images are shot on white and ProductCard CONTAINS rather than crops them; category
images are full-bleed photographs under a scrim and that treatment is not available to
product cards. Do not "optimise" by changing how images are framed.

CLAUDE.md also requires next/image rather than raw <img> throughout.

OBJECTIVE
Make image delivery fast and cacheable without changing how anything looks.

BEFORE CHANGING CODE
- Read CLAUDE.md (Styling and Performance sections) and AGENTS.md.
- Read server/upload.ts — the allowed formats, the 5 MB cap, and where files land.
- Audit for raw <img>: grep -rn "<img" app components
- Read components/storefront/ProductCard.tsx and the category card component for the
  sizing/fill props already in use.
- Read next.config.ts (currently only `output: "standalone"` — there is no images config).
- Read deploy/caddy/oil-top.ir.caddy (it does `encode gzip zstd`; there is no cache-control
  handling).
- Read the Dockerfile runner stage — sharp is a devDependency; check whether the standalone
  image actually has it available for Next's image optimizer, because if it does not, the
  optimizer is falling back and that is worth knowing.

IMPLEMENTATION
1. Verify sharp's availability in the production image and fix it if the optimizer cannot
   use it. This may be the single biggest win in the task; check before doing anything else.
2. Fix any raw <img> found in step "before changing code" — convert to next/image with
   correct width/height or fill + sizes. Do not change the visual result.
3. Configure next.config.ts `images`: formats (AVIF/WebP), deviceSizes/imageSizes trimmed to
   what the layouts actually request, and minimumCacheTTL. Base the sizes on the real
   breakpoints in use, not on the defaults.
4. Add long-lived, immutable cache-control in Caddy for /_next/static/* (content-hashed, so
   `immutable` is safe) and a shorter, revalidating policy for /uploads/* (filenames are
   UUIDs and never reused, so these can also be long-lived — confirm that reading
   server/upload.ts, and if true say so and use it).
5. Check the LCP image on the home page, PLP and PDP has `priority` set, and that nothing
   below the fold does.
6. Consider generating responsive variants at upload time in server/upload.ts. RECOMMENDATION:
   do NOT — Next's optimizer already handles it and doing it at upload adds a failure mode to
   the write path. Record the decision rather than implementing it.

VALIDATION
- `pnpm build && pnpm start`.
- Lighthouse (or Chrome DevTools) on /fa, /fa/products and a PDP: record LCP, CLS and total
  image bytes before and after.
- `curl -I` on a /_next/static asset and an /uploads asset; confirm the cache headers.
- Confirm images still render identically: product cards contained on white, category cards
  full-bleed under the scrim, in both light and dark themes and in both locales.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test` clean.

ACCEPTANCE CRITERIA
- No raw <img> remains in app/ or components/.
- sharp is confirmed available to the production optimizer (or the reason it is not is
  documented and fixed).
- Static assets carry immutable cache headers; uploads carry an appropriate one.
- LCP improves or is unchanged; CLS does not regress.
- No visual change to any card treatment.

DO NOT
- Do not change how product or category images are framed, cropped or scrimmed.
- Do not add a CDN — that is a P3 decision and an Iranian-infrastructure question.
- Do not generate image variants at upload time.
- Do not allow SVG uploads (server/upload.ts deliberately excludes them).
- Do not add `unoptimized` to escape a sizing problem.

FINAL REPORT
Report: sharp's availability in the production image; the raw <img> sites fixed; the images
config chosen and why those sizes; the cache headers set; before/after LCP, CLS and image
bytes for three pages; confirmation of no visual change.
```

---

### PERF-004

```text
TASK ID: PERF-004
TITLE: Trigram index for product search
PRIORITY: P2
PREREQUISITES: BASE-001

CONTEXT
Product search on both the storefront PLP and the admin Products screen tokenises the query
and matches each token against several columns with a case-insensitive `contains` — see
buildProductWhere in lib/services/catalog.ts and the shared helpers in lib/search.ts. Prisma
compiles `{ contains: token, mode: "insensitive" }` to `ILIKE '%token%'`, which cannot use a
btree index and therefore sequentially scans Product on every search.

At ~3,469 products this is fast enough today. It is the hottest unindexed path in the
application and the first thing that degrades as the catalog grows or search traffic rises.
Confirm against PERFORMANCE-BASELINE.md's EXPLAIN output before doing anything — if the
measurement says this is not a problem yet, the correct outcome of this task may be to
document that and stop.

OBJECTIVE
Make product search index-backed using PostgreSQL's pg_trgm, without changing which products
a given query returns.

BEFORE CHANGING CODE
- Read PERFORMANCE-BASELINE.md's search timing and EXPLAIN output. If search is not
  measurably slow, say so and consider stopping — CLAUDE.md's "choose the simplest solution;
  don't add abstraction for a hypothetical future need" applies directly.
- Read CLAUDE.md (Database rules) and AGENTS.md.
- Read lib/search.ts (searchTokens, contains) and its comment explaining the AND-of-ORs
  design and the two bugs it fixed. That behaviour must not change.
- Read buildProductWhere in lib/services/catalog.ts and the admin equivalent in
  server/product.ts.
- Read prisma/migrations/ for the raw-SQL migration format used by this project.
- Note: nameFa is Persian text. Verify trigram behaviour on Persian strings specifically —
  do not assume what works for Latin text works here. Test with real imported product names.

IMPLEMENTATION
1. Add a migration that enables the extension (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) and
   creates GIN trigram indexes on the columns the search actually touches: Product.nameEn and
   Product.nameFa. Prisma cannot express these, so they go in raw SQL in the migration, and
   the schema.prisma comment must point at the migration — follow whatever convention the
   existing generated-column migration (add_product_final_price) used for the same problem.
2. Confirm the ILIKE queries actually use the index. `gin_trgm_ops` supports LIKE/ILIKE with
   leading wildcards, but the planner will ignore it for very short tokens. Check EXPLAIN for
   a 1-character, a 2-character and a 4-character token and record all three.
3. Do NOT change the query shape or the matching semantics. Same tokens in, same product
   rows out. Write a test that asserts a set of representative queries (including the two
   named in lib/search.ts's comment — "Sara Ahmadi" style multi-token, and "Mobil 5W-30"
   against "Mobil 1 5W-30") returns identical results before and after.
4. Consider whether the same index is warranted on Category/Brand names or the admin
   customer search. RECOMMENDATION: no — those tables are tiny (81 brands, ~32 categories).
   Record the decision.
5. Measure: search response time before and after, at the real catalog size, for a short
   token and a long one.

VALIDATION
- Migration applies cleanly to a fresh AND a populated database.
- `pnpm prisma generate`, then `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- EXPLAIN ANALYZE shows a Bitmap Index Scan on the trigram index for a realistic query.
- The result-equivalence test passes, including for Persian queries.
- Manual: search the storefront PLP and the admin Products screen for several real terms in
  both scripts; results identical to before.

ACCEPTANCE CRITERIA
- pg_trgm indexes exist on the searched name columns.
- The planner uses them for realistic queries (proven by EXPLAIN, with the short-token
  caveat documented).
- Search results are unchanged for every tested query, Persian included.
- Measured improvement recorded — or, if the baseline showed no problem, a written
  recommendation not to do this yet.

DO NOT
- Do not change lib/search.ts's tokenisation or the AND-of-ORs semantics.
- Do not switch to PostgreSQL full-text search (tsvector) — it changes matching behaviour
  and needs a Persian dictionary that does not ship with Postgres.
- Do not add a search engine (Meilisearch, Elastic, Typesense) for 3,469 products.
- Do not index columns nothing searches.

FINAL REPORT
Report: whether the baseline justified this work; the migration and indexes added; the three
EXPLAIN results by token length; before/after search timings; the result-equivalence test
including the Persian cases; the decision about other tables.
```

---

### PERF-005

```text
TASK ID: PERF-005
TITLE: Remove the proxy's self-fetch on the root URL
PRIORITY: P2
PREREQUISITES: none

CONTEXT
proxy.ts (Next 16's renamed middleware) handles "/" by redirecting to the storefront's
configured default locale. To learn which locale that is, it does:

    await fetch(new URL("/api/storefront/settings", request.nextUrl.origin), ...)

That is an HTTP round-trip from the app back to itself, on the site's most-linked URL,
before the redirect is even issued. It runs on the edge runtime, where Prisma is not
available — which is exactly why the fetch exists, and the comment says so honestly. It is
wrapped in try/catch with a DEFAULT_LOCALE fallback, so it is correct; it is just expensive
per hit on the one URL that gets shared, bookmarked and crawled most.

OBJECTIVE
Serve "/" without a self-fetch, while keeping the property that an admin changing the
default locale in Settings takes effect without a deploy.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read proxy.ts in full — especially resolveDefaultLocale and the comment explaining the
  edge/Prisma constraint, and the `config.matcher` and its comment about static analyzability.
- Read app/api/storefront/settings/route.ts and server/setting.ts getPublicSettings.
- Read lib/i18n/index.ts (DEFAULT_LOCALE, localeFromSetting, isLocale).
- Read proxy.test.ts — there are existing tests for this file; they must keep passing or be
  updated deliberately.
- Read app/[locale]/layout.tsx's revalidate = 300 for the freshness precedent.

IMPLEMENTATION
1. Consider the options and record the comparison:
   a. Cache the settings read so the fetch is served from Next's cache rather than hitting a
      route handler and the database — smallest change, keeps the current structure.
   b. Move the root redirect out of proxy.ts into a cached Server Component page at the app
      root that reads settings via Prisma directly and redirects — no edge constraint, no
      self-fetch. Check this does not conflict with CLAUDE.md's rule that there is
      deliberately no app/layout.tsx.
   c. Read the locale from a cookie the storefront already sets, falling back to the
      settings lookup only when absent.
   Option (a) is the smallest and probably the right answer. Pick one, justify it.
2. Implement the chosen option. Whatever you choose, preserve exactly:
   - "/" redirects to the configured default locale;
   - any failure falls back to DEFAULT_LOCALE and the site root NEVER 500s (the comment says
     this explicitly and it is the load-bearing property);
   - invalid locale segments still reach app/[locale]/layout.tsx's notFound(), not a redirect
     — that distinction is deliberate for SEO.
3. Keep proxy.ts's auth guards untouched. They are the security-relevant half of the file.
4. Update proxy.test.ts to cover the new path, and confirm the existing auth-guard tests
   still pass unchanged.

VALIDATION
- `pnpm test` — proxy.test.ts green.
- `pnpm build && pnpm start`.
- `curl -I localhost:3000/` redirects to the configured locale; measure the time before and
  after the change.
- Change the default locale Setting in the admin panel; confirm "/" follows it within the
  documented window.
- Stop the database and confirm "/" still redirects (to DEFAULT_LOCALE) rather than erroring.
- Confirm /admin and the protected account paths still redirect unauthenticated users.
- `pnpm lint`, `pnpm tsc --noEmit` clean.

ACCEPTANCE CRITERIA
- "/" no longer performs an uncached HTTP request to the app's own API on every hit.
- The root still never 500s, including with the database down.
- The Settings-driven default locale still applies without a deploy.
- All existing proxy.ts auth behaviour and tests are unchanged.

DO NOT
- Do not touch the authentication guards in proxy.ts.
- Do not create app/layout.tsx.
- Do not make "/" static in a way that freezes the locale until the next deploy.
- Do not widen config.matcher unless the chosen option requires it — and if it does, say so
  and justify the per-request cost.

FINAL REPORT
Report: the three options as compared and which you chose and why; before/after timing for
"/"; the database-down result; the Settings-change result; the state of proxy.test.ts.
```

---

## Phase 5 — Traffic protection

### RATE-001

```text
TASK ID: RATE-001
TITLE: Extend rate limiting to expensive reads, and add Caddy-level limits
PRIORITY: P1
PREREQUISITES: SEC-001

CONTEXT
Top Oil rate-limits five public WRITE endpoints in server/rateLimit.ts — login, register,
fitment inquiry, stock notification, checkout — with separate in-memory fixed-window
buckets. SEC-001 fixed the client-IP source so those limits can no longer be bypassed by
spoofing X-Forwarded-For.

Nothing limits READS. The expensive public read paths are:
  - /sitemap.xml — four unpaginated queries, ~8,000 URL entries (PERF-001 cached it, but a
    cache-busting query string may still reach the generator; check).
  - /api/storefront/products with a `search` parameter — an ILIKE '%token%' scan of Product
    on every call (see lib/services/catalog.ts buildProductWhere).
  - The car finder chain: /api/storefront/cars/* — several sequential lookups per step.
  - /api/storefront/cars/engines/[engineId]/fitment — the heaviest read in the app; it
    resolves a whole fitment profile with product matching (lib/services/fitment.ts, 869
    lines).

Also, the in-memory limiter is per-process. That is correct and sufficient for one
container; it will be wrong the moment a second instance exists. SCALE-001 records that.

OBJECTIVE
Add proportionate limits to the expensive public reads, plus a coarse connection/request
limit in Caddy as the outer layer, without making the site feel broken for real customers.

BEFORE CHANGING CODE
- Read CLAUDE.md and AGENTS.md.
- Read server/rateLimit.ts in full (post-SEC-001) — the bucket helper, getClientIp, and the
  comments explaining each existing window's reasoning. New buckets must be justified the
  same way.
- Read the four read paths above and their route handlers.
- Read deploy/caddy/oil-top.ir.caddy.
- If PERFORMANCE-BASELINE.md exists, use its timings to decide which reads are actually
  expensive rather than guessing.

IMPLEMENTATION
1. Add buckets ONLY where the baseline shows real cost. For each, state the window, the
   allowance and the reasoning in a comment, in the same voice as the existing buckets
   ("a real customer does X; a script does Y"). Suggested starting points, to be adjusted
   against the baseline:
   - search: generous per minute (a customer refines a search repeatedly — this must not
     annoy anyone);
   - fitment resolution: generous per minute (the wizard is a legitimate multi-step flow);
   - sitemap: very low per minute (only crawlers ask, and they ask rarely).
2. Return 429 with a Retry-After header, matching the shape the existing write routes use
   exactly — same envelope, same header.
3. IMPORTANT: do not rate-limit the storefront PAGES, only the API routes and the sitemap.
   A customer browsing the shop must never see a 429. If PERF-002's caching means the pages
   barely touch the database, they need no limit at all — confirm that and say so.
4. Add a coarse outer layer in Caddy: connection limits per IP and, if the installed Caddy
   has the rate_limit module available, a request-rate limit. CHECK AVAILABILITY FIRST —
   rate_limit is not in the standard Caddy build, and a config referencing a missing module
   will fail `caddy validate` and take down every site on this shared VPS. If it is not
   available, do not add it; document what would be needed instead and rely on the app-level
   limits. DEPLOYMENT.md §1 is explicit about not hurting the neighbours.
5. Make sure crawlers are not throttled into failure: Googlebot fetching the sitemap and a
   few hundred product pages is desirable traffic. Check robots.txt's crawl guidance and the
   sitemap limit against each other.
6. Extend server/rateLimit.test.ts with the new buckets.

VALIDATION
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- Manual: hammer the search API past its allowance -> 429 with Retry-After; a normal
  browsing session (10 searches, a wizard run, several PDPs) never sees a 429.
- Manual: browse the storefront normally for two minutes; zero 429s.
- If Caddy config changed: `sudo caddy validate --config /etc/caddy/Caddyfile` MUST pass
  before any reload. Say clearly in the report that reload — never restart — is the correct
  command on this shared box.

ACCEPTANCE CRITERIA
- Every expensive public read has a limit justified by a measurement.
- A realistic customer session triggers no 429.
- 429 responses match the existing shape and carry Retry-After.
- Any Caddy change passes `caddy validate`, or was not made because the module is absent.

DO NOT
- Do not rate-limit storefront page routes.
- Do not add a Caddy directive without confirming the module exists in the installed build.
- Do not introduce Redis for shared limiting — one container, one process, and SCALE-001
  records the trigger for revisiting.
- Do not tighten the existing five write buckets.
- Do not block or throttle known search-engine crawlers into failure.

FINAL REPORT
Report: the buckets added with their windows and reasoning; whether Caddy's rate_limit
module was available and what you did about it; the realistic-session test result; the
crawler consideration; that a `caddy validate` + `systemctl reload caddy` is needed on the
VPS if the site block changed.
```

---

## Phase 6 — Observability & audit

### OBS-001

```text
TASK ID: OBS-001
TITLE: Admin audit log
PRIORITY: P1
PREREQUISITES: REL-003

CONTEXT
Every admin in Top Oil can change prices, stock levels, order statuses and customer account
status, and there is no record of who did what. If a price is wrong, a stock figure is off,
or an order was cancelled, nothing in the system can answer "who changed this, and when".

The project already has the right instinct in one place: ProductPriceLog is an append-only
history written by the admin product route only when price or discountPercent actually
changes (see the model comment in prisma/schema.prisma). That is the pattern to generalise
— narrowly, to the operations that matter.

REL-003 added a structured logger. An audit log is NOT the same thing: logs rotate and are
for debugging; an audit trail is durable business data and belongs in the database.

OBJECTIVE
Record who performed each sensitive admin mutation, when, and what changed — for a small,
deliberately chosen set of operations.

BEFORE CHANGING CODE
- Read CLAUDE.md (Database rules: every model has id/createdAt/updatedAt; soft-delete and
  restrict rules) and AGENTS.md.
- Read prisma/schema.prisma, especially ProductPriceLog and its comment — match its
  append-only spirit.
- Read server/auth.ts requireAdmin() — it already returns the AuthUser, so the actor is
  available at every admin route handler with no plumbing.
- Read the routes that will be audited (listed below) to see the existing shape.
- Read lib/log.ts from REL-003 — the audit write should ALSO produce a log line, but the
  database row is the record of truth.

IMPLEMENTATION
1. Add an `AuditLog` model: id, actorId (relation to User, Restrict on delete so an audited
   admin cannot be deleted out of the trail), action (a string or enum), entityType,
   entityId, a small JSON `changes` field, createdAt. No updatedAt — the rows are never
   updated, exactly as ProductPriceLog omits it and says why. Index on (entityType, entityId)
   and on (actorId, createdAt).
2. Audit a SHORT list — resist the urge to audit everything, because an audit log nobody
   can read is not an audit log:
   - product price / discount change (complements ProductPriceLog with the actor);
   - product status change (activate/deactivate);
   - inventory stock adjustment;
   - order status change;
   - order paymentStatus change (if ORD-003 exists);
   - customer status change (activate/deactivate);
   - admin login success and failure.
3. Write the audit row in the SAME transaction as the change it records, wherever the change
   is already transactional. An audit entry for a rolled-back write is a lie.
4. REDACTION: the `changes` field must record what changed, not the whole entity. Never
   store a passwordHash, a full customer address, or a JWT. Reuse REL-003's allowlist
   thinking and add a test.
5. Decide whether to surface it in the admin UI. RECOMMENDATION: not in this task. CLAUDE.md's
   Wireframe Rules forbid inventing screens the frames do not show, and no frame shows an
   audit screen. Record the decision; the data being queryable via psql is enough for now.
6. Add a retention note: this table grows forever. Write down (in the model comment) what
   the pruning policy should be and when it will matter, even if nothing prunes yet.

VALIDATION
- `pnpm prisma generate` then `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit` clean.
- Migration applies to a fresh and a populated database.
- Manual: perform each of the seven audited actions in the admin panel; confirm exactly one
  AuditLog row per action with the right actor, entity and changes.
- Manual: force a failure mid-transaction on an audited action; confirm NO audit row was
  written.
- grep the audit rows for anything sensitive — nothing may appear.
- Restart `next dev` after prisma generate, or audited routes will return a bare 500.

ACCEPTANCE CRITERIA
- All seven actions produce an audit row with the correct actor.
- Audit rows are written inside the same transaction as the change.
- A rolled-back change leaves no audit row.
- No sensitive value is stored in `changes`.
- The retention question is answered in writing.

DO NOT
- Do not audit read operations.
- Do not audit every field of every model — the seven actions listed, no more.
- Do not store full entity snapshots in `changes`.
- Do not build an admin UI screen for it.
- Do not allow audit rows to be updated or deleted by application code.

FINAL REPORT
Report: the model and indexes; the seven actions wired up; how transactionality was achieved
for each; the rollback test result; the redaction test; the retention policy you documented;
the migration name.
```

---

### OBS-002

```text
TASK ID: OBS-002
TITLE: Uptime monitoring and alerting
PRIORITY: P2
PREREQUISITES: REL-001

CONTEXT
REL-001 added /api/health with a liveness and a readiness answer and wired a Docker
healthcheck to it. That means the container can restart itself when unhealthy. It does not
mean anyone finds out that the site was down for two hours overnight.

Constraints, and they are real:
  - The VPS is SHARED with other sites (DEPLOYMENT.md §0/§1). Anything installed here costs
    the neighbours resources.
  - This is Iranian infrastructure. Many Western monitoring SaaS providers are unreachable
    or blocked, in one direction or both. Verify before adopting; an alerting system that
    silently stopped working is worse than none, because it is trusted.
  - The alert has to reach a person who is in Iran, on a channel that works there.

OBJECTIVE
Ensure a human is told, within minutes, when oil-top.ir stops serving — using a channel
verified to work.

BEFORE CHANGING CODE
- Read DEPLOYMENT.md in full, especially §0, §1 and §5.4 (the confirm steps).
- Read app/api/health/route.ts from REL-001 and the compose healthcheck.
- Read docker-compose.prod.yml.
- Read REL-004's decision record for what notification channel was already chosen and
  verified there — reuse it rather than introducing a second one.

IMPLEMENTATION
1. Evaluate and record, do not pick blind:
   a. Uptime Kuma self-hosted on a DIFFERENT machine (a second VPS, a home box, anywhere)
      probing https://oil-top.ir/api/health from outside. Best signal: it tests DNS, TLS,
      Caddy, the app and the database in one probe, from a real network path. Costs this
      VPS nothing.
   b. Uptime Kuma on this VPS — cheap to set up, but a probe running on the box cannot tell
      you the box is unreachable, which is the failure you most need to know about. Weak.
   c. A cron on the VPS that curls the health endpoint and alerts on failure — same blind
      spot as (b), but no new container.
   d. An external monitoring service, IF verified reachable and reliable for an .ir domain.
   Option (a) is the right answer if any second machine exists. Say which you chose and why.
2. Probe the READINESS endpoint, not just liveness — a process that answers 200 while its
   database is unreachable is not up as far as a customer is concerned.
3. Configure the alert to reach a channel verified to work in Iran (whatever REL-004 settled
   on). Send a real test alert and confirm it arrives — an untested alert path is the most
   common way monitoring fails.
4. Add checks for the things that fail slowly and silently:
   - TLS certificate expiry (Caddy auto-renews, but a renewal failure is exactly the kind of
     silent problem worth an alert 14 days out);
   - disk space on the VPS (the uploads volume, the Postgres volume and Docker's logs all
     grow; REL-001 bounded the logs, the other two are unbounded);
   - the backup job's success (DR-001) — a backup that stopped running is a disaster waiting.
5. Set thresholds that will not cry wolf: a single failed probe on a home connection is
   noise. Require two or three consecutive failures.
6. Document the whole thing in DEPLOYMENT.md: what is monitored, from where, who gets
   alerted, how to silence it during a deploy, and how to test that alerting still works.

VALIDATION
- Stop the app container on a staging/local equivalent; confirm an alert fires within the
  configured window.
- Stop the database only; confirm the readiness probe fails and alerts (this is the case a
  naive liveness check misses).
- Send a manual test alert and confirm delivery.
- Restart everything; confirm a recovery notification arrives.
- Confirm nothing new was installed on the production VPS beyond what step 1 justified.

ACCEPTANCE CRITERIA
- An outage produces an alert to a real person within minutes, on a verified channel.
- The probe checks readiness, not just liveness.
- Certificate expiry, disk space and backup success are monitored.
- Alert delivery has been tested end to end, not assumed.
- DEPLOYMENT.md documents it, including how to test it again in six months.

DO NOT
- Do not install a Prometheus/Grafana/Loki stack on a shared VPS.
- Do not adopt a monitoring provider without verifying it reaches this domain from this
  network.
- Do not probe only from the monitored machine itself.
- Do not alert on anything that will produce daily false positives — one ignored alert
  channel is worse than none.
- Do not expose any new port publicly on the production VPS.

FINAL REPORT
Report: the options compared and the choice; what is probed and from where; the alert channel
and the delivery test result; the four failure simulations; what was added to DEPLOYMENT.md.
```

---

## Phase 7 — Backup & disaster recovery

### DR-001

```text
TASK ID: DR-001
TITLE: Automated backups, stored off the box
PRIORITY: P0
PREREQUISITES: none

CONTEXT
DEPLOYMENT.md §8 says it plainly: "The database lives in the topoil_postgres_data volume and
uploaded images in topoil_uploads. **Neither is backed up by anything yet** — worth a cron
job before real data goes in." It documents two commands (a pg_dump through
`docker compose exec` and a tar of the uploads volume) and stops there. Nothing runs them,
nothing copies them off the machine, and no restore has ever been attempted.

What is at stake if that volume is lost: ~3,469 products, 81 car brands, ~561 car models,
~55,000 fitment profile items — the result of a scrape-and-import project documented across
oil-city-import-notes.md and topoil-scrape-and-enrichment-tasks.md, representing weeks of
work — plus every customer account, every order, and every uploaded product photograph.

This is the single most consequential unaddressed item in the project. A `docker compose
down -v` typed in the wrong directory ends the business.

OBJECTIVE
Automated, scheduled, verified backups of both the database and the uploads volume, with at
least one copy stored off the VPS.

BEFORE CHANGING CODE
- Read DEPLOYMENT.md in full — §0 and §1 (shared VPS constraints), §8 (the existing
  commands), §9 (the down -v warning and why `name: topoil` matters).
- Read docker-compose.prod.yml — the volume names are topoil_postgres_data and
  topoil_uploads because of the pinned project name.
- Read .env.production.example for the credential variable names.
- Check what is available on the VPS: cron or systemd timers, free disk, and what off-box
  destination the operator actually has (another VPS, object storage, a home machine). If
  you cannot determine this in-session, write the script to be destination-agnostic and
  leave the destination as a single documented variable.

IMPLEMENTATION
1. Write a backup script (suggested deploy/backup/topoil-backup.sh, next to the existing
   deploy/caddy/ — that directory already establishes the "operational files live under
   deploy/" convention). It must:
   - `pg_dump` the database through the compose service, gzipped, to a timestamped file;
   - tar+gzip the uploads volume to a timestamped file;
   - be idempotent and safe to run twice;
   - `set -euo pipefail` and fail LOUDLY — a backup script that fails silently is the same
     as no backup;
   - write a status line the OBS-002 monitor can check (a sentinel file with a timestamp, or
     an exit code a wrapper reports);
   - never print the database password to stdout or into a log.
2. ENCRYPTION: the dump contains every customer's name, phone number and address. It must be
   encrypted before it leaves the machine. Use gpg symmetric or age, with the passphrase/key
   supplied from a file outside the repo. The key must NOT be stored only on the VPS being
   backed up — say so in the documentation, because a key lost with the machine makes the
   backup worthless.
3. RETENTION: keep 7 daily, 4 weekly, 3 monthly (adjust to available disk and say why).
   Prune older ones. Prune AFTER a successful new backup, never before.
4. OFF-BOX COPY: this is the part that matters. A backup on the same volume as the data is
   not a backup. Push to the destination determined above (rsync/scp/rclone). Verify the
   transfer succeeded before pruning anything locally.
5. Schedule it — cron or a systemd timer — at a low-traffic hour. Note that `pg_dump` on a
   sub-1 GB database takes seconds, so no special care about locking is needed at this size.
6. Update DEPLOYMENT.md §8: replace the "not backed up by anything yet" paragraph with what
   now exists, where backups go, how to check the last one succeeded, and where the
   encryption key lives (the location, never the key).

VALIDATION
- Run the script manually on a local/staging equivalent of the stack. Confirm both artifacts
  are produced, are non-trivially sized, and are encrypted (`file` should not identify them
  as gzip once encrypted).
- Confirm the off-box copy arrives at the destination.
- Run it twice; confirm idempotency and that retention pruning behaves.
- Break it deliberately (wrong credentials) and confirm it exits non-zero and is loud.
- Confirm no password appears in the script's output or in any log it writes.
- Confirm the scheduled job actually fires (check the timer/cron log after one cycle, or
  trigger it manually through the same path the scheduler uses).

ACCEPTANCE CRITERIA
- Both the database and the uploads volume are backed up on a schedule.
- Backups are encrypted before leaving the machine.
- At least one copy exists off the VPS, and its arrival is verified by the script.
- Failures are loud and detectable.
- Retention prunes only after a verified success.
- DEPLOYMENT.md §8 describes reality.

DO NOT
- Do not store the only copy on the same machine or the same volume as the data.
- Do not commit the encryption key, passphrase, or any credential to the repository.
- Do not use `docker compose down` anywhere in the backup path.
- Do not set up WAL archiving or point-in-time recovery — a nightly dump is the right size
  for this order volume; revisit at ~100 orders/day.
- Do not skip encryption because it is inconvenient; the dump is a customer database.
- Do not test a restore in this task — that is DR-002, deliberately separate.

FINAL REPORT
Report: the script's location and what it does; the encryption method and where the key is
kept (not the key); the retention policy and the reasoning; the off-box destination and the
verification method; the schedule; the deliberate-failure test result; what changed in
DEPLOYMENT.md §8.
```

---

### DR-002

```text
TASK ID: DR-002
TITLE: Rehearse the restore and write the recovery runbook
PRIORITY: P0
PREREQUISITES: DR-001

CONTEXT
DR-001 created automated, encrypted, off-box backups of Top Oil's database and uploads
volume. An untested backup is a belief, not a capability — and the failure modes that make
backups worthless (a truncated dump, a lost encryption key, a schema the current migrations
cannot read, a missing extension, an uploads archive with the wrong internal paths) are all
invisible until someone actually tries to restore.

The source checklist puts it well: "Test recovery instead of assuming backups work."

Relevant project specifics:
  - prisma/seed.ts REFUSES to run against a populated database unless SEED_RESET=1, because
    a seed run destroyed hand-entered admin data once. A restore procedure must not tempt
    anyone into setting that flag.
  - Migrations are applied by a one-shot `migrate` compose service, not by the app.
  - PERF-004 may have added a pg_trgm extension; a restore must reinstate it.
  - Uploads are referenced by path from the database (Product.image etc.), so a restore that
    brings back the database without the uploads volume produces a catalog of broken images.

OBJECTIVE
Actually restore a backup into a clean environment, prove the result is complete and
correct, measure how long it took, and write the runbook someone can follow at 2am.

BEFORE CHANGING CODE
- Read DEPLOYMENT.md (all of it, especially §3, §4, §7 and the new §8 from DR-001).
- Read deploy/backup/topoil-backup.sh from DR-001.
- Read docker-compose.prod.yml and the Dockerfile's `migrator` stage.
- Read prisma/seed.ts's guard.
- Take the most recent real backup artifact — not one you generate specially for the test.
  A backup you make to test with is not the backup you will have in a disaster.

IMPLEMENTATION
1. Build a clean target: a fresh compose stack (a scratch directory, a fresh project name so
   it cannot touch the real volumes, or a separate machine). Confirm before starting that
   nothing you are about to run can reach the production volumes — DEPLOYMENT.md §9 explains
   why `name: topoil` matters, and this is exactly the situation where it matters.
2. Restore, timing each phase:
   - decrypt the artifacts (this is where a lost key is discovered);
   - restore the database dump;
   - restore the uploads archive into the volume;
   - bring the stack up and let the `migrate` service run;
   - start the app.
3. VERIFY, with evidence, not impressions:
   - row counts for products, categories, brands, carBrands, carModels, carEngines,
     fitmentProfileItems, orders, users match the source (record both sets of numbers);
   - the admin panel logs in with a known account;
   - a product detail page renders WITH ITS IMAGE (this is the check that catches an uploads
     restore that silently failed);
   - the car finder resolves a known car to its fitment profile end to end;
   - a known order appears in the admin Orders screen with its items and totals intact;
   - any extension the schema needs (pg_trgm if PERF-004 landed) is present.
4. Measure and record:
   - RTO — wall-clock time from "start restoring" to "site serving correctly";
   - RPO — the age of the restored data, i.e. the worst-case data loss given the backup
     schedule. State both as numbers, not adjectives.
5. Write the runbook as a new section in DEPLOYMENT.md (or a linked RECOVERY.md if it grows
   past a section). It must be followable by someone who did not write it, under stress:
   exact commands in order, what "correct" looks like at each step, what to do when a step
   fails, and where the decryption key is kept. Include the "restore to a scratch project
   name first, never straight over production" instruction prominently.
6. Record every problem you hit during the rehearsal and how you fixed it. That list is the
   most valuable output of this task.
7. Schedule the next rehearsal (a calendar note, or a line in the runbook stating the
   cadence — quarterly is reasonable).

VALIDATION
- The restored stack passes all six checks in step 3, with the numbers recorded.
- RTO and RPO are stated as measured figures.
- A second person (or you, following only the written runbook and nothing else) can execute
  it — read it back and remove every step that assumes knowledge not written down.
- The production stack is confirmed untouched throughout.

ACCEPTANCE CRITERIA
- A real backup was restored into a clean environment and verified against six checks.
- Measured RTO and RPO are documented.
- A step-by-step runbook exists in the repository.
- Every problem found during the rehearsal is written down with its fix.
- The production database and volumes were never at risk.

DO NOT
- Do not restore over the production database or volumes under any circumstances.
- Do not set SEED_RESET=1 anywhere in the recovery procedure.
- Do not generate a fresh backup to test with — use the real scheduled artifact.
- Do not declare the backup working without rendering a page with a restored image.
- Do not write a runbook that says "restore the database" without the exact command.

FINAL REPORT
Report: the six verification results with row counts; measured RTO and RPO; every problem
encountered and its fix; where the runbook lives; the rehearsal cadence you set; explicit
confirmation that production was never touched.
```

---

## Phase 8 — Supply chain & CI

### CI-001

```text
TASK ID: CI-001
TITLE: CI — add build, E2E and dependency-audit gates
PRIORITY: P1
PREREQUISITES: none

CONTEXT
.github/workflows/ci.yml runs on pull_request and does: checkout, pnpm setup, Node 22,
install --frozen-lockfile, `pnpm lint`, `pnpm tsc --noEmit`, `pnpm prisma generate`,
`pnpm prisma migrate deploy`, `pnpm prisma:seed`, `pnpm test`. It has a postgres:16 service
with a healthcheck. That is a solid foundation.

Three gaps:
  - It never runs `pnpm build`. A change that breaks the production Next build — a bad
    route export, an invalid metadata shape, a Server/Client boundary violation — merges
    green and is only discovered on the VPS.
  - It never runs Playwright. There are ten E2E specs covering auth, catalog, fitment,
    inventory, orders and the storefront shop flow, and none of them gate a merge.
  - It never runs `pnpm audit`. 19 advisories currently exist and nothing surfaces new ones.

Known local hazards that will bite in CI too, from the project's history:
  - The E2E global-setup's seed refuses to run against a populated test database unless
    SEED_RESET=1.
  - A running `next dev` blocks Playwright from starting its own server (not an issue in CI,
    but relevant to how playwright.config.ts is written — read it).
  - `pnpm test` uses whatever DATABASE_URL is set; the E2E database is a different one.

OBJECTIVE
Make CI catch the failures that currently reach production, without making it so slow that
it gets ignored.

BEFORE CHANGING CODE
- Read .github/workflows/ci.yml in full.
- Read playwright.config.ts — how it starts the app, which base URL, which projects, whether
  it reuses an existing server.
- Read e2e/global-setup.ts and scripts/e2e-reset-db.ts — how the test database is prepared,
  and the SEED_RESET guard.
- Read .env.test.example for the variables the E2E run needs.
- Read package.json's scripts.
- Read the Dockerfile — the build stage needs NEXT_PUBLIC_SITE_URL at build time (it is
  baked into sitemap/robots URLs), so a CI build needs it too or it will bake localhost.

IMPLEMENTATION
1. Add a `pnpm build` step. Provide NEXT_PUBLIC_SITE_URL explicitly so CI builds the same
   way production does. Put it after tsc and before tests, so a build break fails fast.
2. Add a Playwright job. Consider making it a SEPARATE job from the fast checks so lint/tsc
   failures report in a minute rather than waiting on browsers. It needs:
   - its own postgres service (or a second database on the same one) matching what
     e2e/global-setup.ts expects;
   - SEED_RESET set appropriately for a freshly created CI database — read global-setup.ts
     and set what it actually requires, do not guess;
   - `pnpm exec playwright install --with-deps chromium` (pin to the browsers actually used);
   - the report uploaded as an artifact on failure, so a red build is debuggable.
3. Add a `pnpm audit` step. Do NOT fail the build on the current 19 advisories — that makes
   CI permanently red and teaches everyone to ignore it. Instead: fail only on advisories at
   or above a chosen severity for PRODUCTION dependencies, or record the current set as a
   baseline and fail only on NEW ones. CI-002 does the actual remediation. State which
   approach you chose and why.
4. Consider adding the workflow to `push` on main as well as `pull_request`, so main is
   known-green. Cheap, and it catches anything merged without a PR.
5. Cache what is cacheable (pnpm store is already cached via setup-node; consider the Next
   build cache and the Playwright browser cache) so the added steps do not double CI time.
6. Record the before/after CI duration.

VALIDATION
- Open a PR (or push a branch) and confirm the workflow runs green end to end.
- Deliberately break the build (e.g. an invalid export in a route file) and confirm CI fails
  at the build step. Revert.
- Deliberately break an E2E assertion and confirm the Playwright job fails and uploads its
  report. Revert.
- Confirm total CI time is still acceptable and record it.

ACCEPTANCE CRITERIA
- `pnpm build` runs in CI with the correct NEXT_PUBLIC_SITE_URL.
- Playwright runs in CI and its report is uploaded on failure.
- `pnpm audit` runs and fails only on new or high-severity production advisories.
- Both deliberate breakages were caught.
- CI duration is recorded and reasonable.

DO NOT
- Do not fail the build on the existing 19 advisories — that is CI-002's job.
- Do not add a deployment step; deploys are manual per DEPLOYMENT.md and that is deliberate.
- Do not put any real secret in the workflow file.
- Do not run Playwright against a shared or persistent database.
- Do not skip `--frozen-lockfile`.

FINAL REPORT
Report: the jobs and steps added; how the E2E database is prepared and what SEED_RESET
required; the audit gating strategy chosen and why; both deliberate-failure results; CI
duration before and after.
```

---

### CI-002

```text
TASK ID: CI-002
TITLE: Dependency remediation and automated updates
PRIORITY: P2
PREREQUISITES: CI-001

CONTEXT
`pnpm audit` on Top Oil currently reports 19 advisories: 15 high, 4 moderate. Assessed
individually, almost all are transitive through build and lint tooling rather than through
anything that runs in production:

  - brace-expansion, js-yaml — via eslint's dependency tree. Dev-time only.
  - postcss (three advisories), nanoid — via next and @tailwindcss/postcss. Build-time.
  - fast-uri — via ajv, reached through @hookform/resolvers and prisma's dev tooling.
  - mysql2 (two advisories) — bundled by the prisma CLI. Top Oil uses PostgreSQL and never
    loads it.
  - deepmerge-ts — via @prisma/config.
  - sharp — via next, optional, used by the image optimizer.
  - **sanitize-html 2.17.6 — the ONE direct production dependency with an advisory**
    (GHSA-g8qq-57p8-ggw5, stored XSS via SVG SMIL scheme-policy bypass; patched in 2.17.7).
    Note: lib/sanitize.ts calls it with `allowedTags: []`, which strips everything, so this
    particular bypass is not reachable in this codebase. It should still be updated.

The point of this task is not to reach zero. It is to update what genuinely matters, and to
put a process in place so the next advisory is noticed within days rather than months.

BEFORE CHANGING CODE
- Read CLAUDE.md (Tech Stack — Prisma 7 needs a driver adapter; Next 16; pnpm) and AGENTS.md.
- Run `pnpm audit` and `pnpm outdated` and read the CURRENT output — the list above was
  accurate on 2026-09-03 and will have changed.
- Read package.json and pnpm-workspace.yaml.
- Read .github/workflows/ci.yml (post-CI-001) for the audit gate you are feeding.
- Read lib/sanitize.ts to confirm the allowedTags: [] usage before deciding urgency.

IMPLEMENTATION
1. Triage the CURRENT advisory list into three groups, in writing: (a) reachable in
   production, (b) build/dev-time only, (c) not reachable at all (e.g. mysql2 in a
   PostgreSQL-only app). Do not treat a high severity in a lint plugin as equivalent to a
   moderate in a runtime dependency.
2. Fix group (a) first. Update sanitize-html to >= 2.17.7. Verify lib/sanitize.ts still
   behaves identically — its tests, plus a manual check that markup submitted through an
   admin description field is still stripped to plain text.
3. Update group (b) where the fix is a patch or minor bump with no API change. For anything
   requiring a major bump of next, prisma, react, tailwind or heroui: DO NOT do it in this
   task. Note it, with the reason, for a dedicated upgrade task. A framework major is not a
   security fix, it is a project.
4. Use pnpm overrides for transitive advisories that have no path through a direct
   dependency update — but only where the override is safe and you can say why. An override
   that pins an incompatible version is worse than the advisory.
5. Set up automated updates: Renovate or Dependabot, configured conservatively —
   - group patch and minor updates into one PR per week, not one PR per package;
   - separate majors, and do not auto-open them for the framework packages;
   - respect the pinned packageManager (pnpm@11.18.0) and the exact-pinned next/react
     versions in package.json (they are pinned without a caret, deliberately — do not
     let the bot add one).
6. After the updates: full verification. This is the risky part of the task.

VALIDATION
- `pnpm install --frozen-lockfile` succeeds from a clean node_modules.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm test`, `pnpm build` all clean.
- `pnpm test:e2e` — the full Playwright suite, because a dependency update can break
  rendering in ways unit tests do not see.
- `pnpm audit` — the remaining advisories are exactly the ones you triaged as (b)/(c), and
  each has a written reason.
- Manual: the admin panel loads, a product form saves, the storefront renders in both
  locales and both themes, an image uploads.
- Confirm the bot's first PR (or a dry run of its config) does what you intended.

ACCEPTANCE CRITERIA
- Every production-reachable advisory is resolved or has a written justification.
- sanitize-html is at a patched version and its stripping behaviour is unchanged.
- Framework majors were NOT attempted here, and are recorded as follow-up work.
- An update bot is configured conservatively and its config is committed.
- The full test suite including E2E passes after the updates.

DO NOT
- Do not chase zero advisories by force-overriding transitive versions.
- Do not bump next, react, prisma, tailwind or heroui across a major in this task.
- Do not remove the exact version pins on next/react in package.json.
- Do not change the pinned packageManager version.
- Do not let the bot open more than one grouped PR per week.

FINAL REPORT
Report: the current advisory list triaged into the three groups; what was updated and to
what; the sanitize-html verification; which majors were deferred and why; the bot config;
full validation results including E2E.
```

---

## Phase 9 — Payment integration (only if BASE-002 chose Model B)

> If `BASE-002` chose Model A (cash on delivery / phone confirmation), **skip this phase
> entirely.** `ORD-003` already covers the admin-set payment status, and these three tasks
> should be deleted from the plan rather than carried as debt.

### PAY-001

```text
TASK ID: PAY-001
TITLE: PSP adapter and Payment model
PRIORITY: P0 (only if BASE-002 chose a payment gateway)
PREREQUISITES: BASE-002, ORD-001

CONTEXT
Top Oil's checkout (server/order.ts createStorefrontOrder, POST /api/storefront/orders)
creates orders PENDING/UNPAID and decrements stock inside the same transaction. There is no
payment integration; components/storefront/checkout/CheckoutView.tsx renders a placeholder.
BASE-002 recorded the decision to integrate an Iranian PSP and named which one, along with
its verify-call semantics, its credential variables, and the answers to the stock-holding
questions. READ docs-payment-decision.md FIRST — it is this task's specification.

Iranian PSPs use a redirect-and-verify flow, not webhooks: you request a payment token, send
the customer to the gateway, they return to your callback URL, and you then make a
SERVER-SIDE verify call to the PSP. The callback's query parameters are attacker-controlled
and prove nothing on their own. That verify call is the security boundary.

OBJECTIVE
Build the provider-agnostic seam and the Payment model. This task does NOT handle the
callback (PAY-002) — it creates the payment record and gets the customer to the gateway.

BEFORE CHANGING CODE
- Read docs-payment-decision.md in full.
- Read CLAUDE.md (API rules: thin route handlers, logic in server/, Zod on every input;
  Database rules) and AGENTS.md.
- Read server/order.ts createStorefrontOrder end to end, especially the transaction.
- Read app/api/storefront/orders/route.ts.
- Read prisma/schema.prisma Order/OrderItem and the migration conventions.
- Read the chosen PSP's official documentation for the exact request/response shapes,
  the amount unit (Rial vs Toman — getting this wrong charges 10x), and the verify endpoint.

IMPLEMENTATION
1. Add a `Payment` model: id, orderId (relation, and decide whether an order may have more
   than one payment attempt — it usually must, since a customer can fail and retry),
   provider, providerRef (the PSP's token/authority — unique), amount, status (its own enum:
   INITIATED / PENDING / VERIFIED / FAILED / REFUNDED), a JSON field for the provider's raw
   response, createdAt, updatedAt. Index on orderId and on providerRef.
   The amount is stored on the Payment as well as the Order deliberately: it is what was
   actually requested from the gateway, and it must be compared against the verify response.
2. Create a provider adapter under server/payment/ with a narrow interface — `initiate()`
   and `verify()` — and one implementation for the chosen PSP. The interface exists so a
   provider change is one file, not a rewrite; keep it to the two methods the flow actually
   needs. CLAUDE.md's "avoid over-engineering" applies — do not build a plugin registry.
3. Credentials come from environment variables ONLY. Add them to .env.production.example
   with placeholder values and a comment. Never log them.
4. Wire initiation: after createStorefrontOrder succeeds, create the Payment row and call
   initiate(). The AMOUNT SENT TO THE GATEWAY MUST COME FROM THE PERSISTED ORDER, re-read
   from the database — never from the request, never from a client-supplied figure, never
   from an in-memory value that a caller could have influenced.
5. Handle the amount unit explicitly and test it. Order totals are in Toman throughout this
   codebase (see the Decimal columns and lib/storefront/pricing.ts); if the PSP expects
   Rial, the conversion is a named, tested function, not an inline `* 10`.
6. Timeouts and failure: the PSP call must have a timeout and must not leave an order in an
   ambiguous state if it fails. Decide what happens to the order and its held stock when
   initiation fails, per docs-payment-decision.md's answer to question 3a, and implement it.
7. Tests: adapter unit tests against recorded fixtures (never against the live PSP), the
   amount-unit conversion, and the "initiation failed" path.

VALIDATION
- `pnpm prisma generate` then `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit`, `pnpm build`.
- Migration applies to a fresh and a populated database.
- Manual, in the PSP's SANDBOX only: place an order, confirm a Payment row is created with
  the correct amount and provider reference, and confirm the redirect to the gateway.
- Confirm no credential appears in any log line or any response body.
- Restart `next dev` after prisma generate.

ACCEPTANCE CRITERIA
- A Payment row is created for each attempt with the amount re-read from the database.
- The amount unit conversion is explicit and tested.
- Credentials live only in environment variables.
- Initiation failure leaves the order in a defined state, per the decision record.
- The customer reaches the gateway in the sandbox.

DO NOT
- Do not mark anything PAID in this task — that requires the verify call (PAY-002).
- Do not trust any amount, order id or status supplied by the client.
- Do not test against the live gateway.
- Do not commit credentials, merchant ids or keys, even in examples.
- Do not build an abstraction beyond initiate/verify.

FINAL REPORT
Report: the model and migration; the adapter interface and the provider implemented; the
amount unit and its conversion test; what happens when initiation fails; the sandbox result;
confirmation that credentials never reach a log.
```

---

### PAY-002

```text
TASK ID: PAY-002
TITLE: Callback verification and idempotent settlement
PRIORITY: P0 (only if BASE-002 chose a payment gateway)
PREREQUISITES: PAY-001

CONTEXT
PAY-001 created the Payment model and the PSP adapter, and gets a customer to the gateway.
This task handles their return.

The threat model, stated plainly: the customer returns to a callback URL of your app with
query parameters supplied by their own browser. Those parameters are attacker-controlled.
Anyone can visit that URL with any values. **The only thing that proves a payment happened
is a server-side verify call to the PSP, and the only thing that proves it was YOUR payment
for THIS order at THIS amount is comparing the verify response against the stored Payment
row.**

The second hazard is duplication: browsers retry, customers refresh the return page, and
gateways sometimes call back twice. Settling twice means marking an order paid twice and, in
a refund scenario, refunding twice.

BEFORE CHANGING CODE
- Read docs-payment-decision.md (question 3e: the exact idempotency key for settlement).
- Read PAY-001's adapter, the Payment model, and server/payment/.
- Read CLAUDE.md (API rules) and AGENTS.md.
- Read ORD-001's idempotency implementation on Order — the same reasoning applies here and
  the two should look like siblings.
- Read ORD-003's paymentStatus transition rules (VALID_PAYMENT_TRANSITIONS in server/order.ts).
- Read the PSP's verify endpoint documentation, including what it returns for an
  already-verified transaction — that response IS the duplicate-settlement case.

IMPLEMENTATION
1. Add the callback route. It is a public, unauthenticated GET or POST (per the PSP) that
   must:
   - Zod-validate every parameter;
   - look up the Payment by the provider reference — NOT by an order id from the query;
   - make the server-side verify call;
   - compare the verified amount against the STORED Payment amount, and reject a mismatch
     loudly (this is the check that stops a customer paying 1,000 Toman for a 1,000,000
     Toman order);
   - only then mark the Payment VERIFIED and transition the Order's paymentStatus, in ONE
     transaction.
2. IDEMPOTENCY. Settlement must be safe to run any number of times:
   - guard on the Payment's own status — a Payment already VERIFIED short-circuits to the
     same success response rather than settling again;
   - do the status transition with a conditional update so two concurrent callbacks cannot
     both settle (the same technique server/order.ts already uses for the stock decrement:
     put the expected current state in the WHERE clause and check the affected count);
   - handle the PSP's "already verified" response as success, not as an error.
3. Failure paths, each with a defined outcome: the customer cancelled at the gateway; the
   verify call fails or times out; the amounts mismatch; the Payment reference is unknown.
   None may leave an order in an ambiguous state, and none may reveal internal detail to the
   browser. Redirect the customer to a clear result page in their locale.
4. Rate-limit the callback route — it is public and it triggers an outbound network call.
   Use server/rateLimit.ts, matching the existing buckets' style.
5. Log every settlement attempt and its outcome through lib/log.ts (REL-003), with the
   Payment id and the result — but never the raw PSP response if it contains card data, and
   never full customer contact details. If OBS-001 exists, write an audit row too.
6. Tests, and these are the important ones:
   - a valid callback settles exactly once;
   - the SAME callback replayed does not settle twice and returns the same result;
   - two concurrent callbacks settle exactly once;
   - an amount mismatch is rejected and the order stays unpaid;
   - an unknown provider reference is rejected;
   - a verify-call timeout leaves the order unpaid and recoverable (PAY-003 sweeps it).

VALIDATION
- `pnpm test` including all six cases above.
- `pnpm lint`, `pnpm tsc --noEmit`, `pnpm build` clean.
- Manual, in the PSP SANDBOX: complete a payment end to end; confirm the order becomes PAID
  exactly once. Then replay the exact callback URL and confirm nothing changes.
- Manual: forge a callback with a valid-looking but wrong amount; confirm rejection.
- Manual: forge a callback with a random provider reference; confirm rejection.
- Confirm no PSP credential or raw card-adjacent data appears in any log.

ACCEPTANCE CRITERIA
- No order is ever marked paid without a successful server-side verify call.
- The verified amount is compared against the stored amount and a mismatch is rejected.
- Replayed and concurrent callbacks settle exactly once.
- Every failure path has a defined outcome and a customer-facing result page.
- Settlement is logged and audited.

DO NOT
- Do not trust ANY value in the callback query string as proof of payment.
- Do not look the payment up by an order id supplied in the callback.
- Do not mark an order paid before the verify call returns success.
- Do not expose the PSP's error text to the customer.
- Do not skip the amount comparison because the PSP "already checks it".
- Do not make the callback route require authentication — the customer may return in a new
  browser context.

FINAL REPORT
Report: the callback route and its validation; how idempotency is enforced (the exact
conditional update); the six test results; the three manual forgery attempts and their
outcomes; what is logged and audited.
```

---

### PAY-003

```text
TASK ID: PAY-003
TITLE: Payment reconciliation sweep and refund path
PRIORITY: P1 (only if BASE-002 chose a payment gateway)
PREREQUISITES: PAY-002

CONTEXT
PAY-002 settles payments when the customer returns to the callback URL. Customers do not
always return: they close the tab at the gateway, lose signal on the redirect back, or the
verify call times out. In every one of those cases the money may have left the customer's
account while Top Oil's order sits UNPAID — the worst possible state, because the customer
believes they paid and the shop believes they did not.

Separately, ORD-002 restores stock when an order is CANCELLED, and
docs-payment-decision.md's answer to question 3a defined whether and how long an unpaid
order holds stock. Both need a job that acts on stale unpaid orders.

And a PAID order that must be cancelled needs a refund path, or the shop's PaymentStatus
enum has a REFUNDED value that nothing can ever set.

OBJECTIVE
Close the loop: find payments whose outcome is unknown and resolve them against the PSP, and
give staff a refund action.

BEFORE CHANGING CODE
- Read docs-payment-decision.md (questions 3a and 3d).
- Read PAY-001's adapter and PAY-002's settlement path — the sweep must reuse the SAME
  idempotent settlement function, not a parallel copy of it. A second settlement code path
  is how double-settlement bugs are born.
- Read ORD-002's cancellation-and-stock-restoration transaction.
- Read ORD-003's VALID_PAYMENT_TRANSITIONS.
- Read server/rateLimit.ts and lib/log.ts.
- Read the PSP's documentation for querying a transaction's status and for refunds — some
  Iranian PSPs have no API refund at all, in which case the "refund" is a manual bank
  transfer and the app only records it. Find out which, and say so.

IMPLEMENTATION
1. Reconciliation sweep. A script under scripts/ (following the conventions of the existing
   scripts there) that:
   - finds Payment rows stuck in INITIATED/PENDING older than a threshold;
   - asks the PSP for each one's real status;
   - routes a successful one through the SAME settlement function PAY-002 uses (idempotent
     by construction, so a race with a late callback is safe);
   - marks a genuinely failed one FAILED, and applies the stock/cancellation policy from
     docs-payment-decision.md;
   - logs every action and writes an audit row (OBS-001).
   Make it safe to run repeatedly and safe to run concurrently with live callbacks.
2. Schedule it — the same mechanism DR-001 used for backups. Frequent enough that a
   customer is not left in limbo for hours; infrequent enough not to hammer the PSP.
3. Stale unpaid orders. Implement the policy from question 3a: if unpaid orders hold stock,
   expire them after the defined window and restore stock through ORD-002's existing
   transaction — do not write a second stock-restoration path.
4. Refund. Add an admin action that transitions a PAID order to REFUNDED, per ORD-003's
   transition rules. If the PSP supports API refunds, call it and record the result; if it
   does not, the action records that a manual refund was made, requires a note, and writes
   an audit row naming the admin. Be explicit in the UI about which of the two it is —
   staff must not believe the app moved money when it did not.
5. Decide what a refund does to stock, and to the order's `status`. Write the answer down;
   a refunded-but-delivered order is a real case.
6. Tests: the sweep settles a completed-but-uncallbacked payment exactly once; the sweep and
   a simultaneous callback together settle exactly once; a failed payment expires correctly
   and restores stock once; the refund transition follows the rules.

VALIDATION
- `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit`, `pnpm build` clean.
- Manual, in the SANDBOX: pay successfully but close the browser before the callback
  completes; run the sweep; confirm the order becomes PAID exactly once with an audit row.
- Manual: run the sweep twice in a row; confirm the second run changes nothing.
- Manual: run the sweep while a callback for the same payment is in flight; confirm exactly
  one settlement.
- Manual: refund a paid order; confirm the transition, the audit row, and (if applicable)
  the PSP call.

ACCEPTANCE CRITERIA
- A payment completed without a callback is reconciled automatically.
- The sweep and the callback share one settlement function and cannot double-settle.
- Stale unpaid orders are handled per the recorded policy, restoring stock exactly once.
- A refund action exists, follows the transition rules, and is audited.
- Whether a refund moves money or only records it is unambiguous in the UI.

DO NOT
- Do not write a second settlement code path.
- Do not write a second stock-restoration path — reuse ORD-002's.
- Do not auto-refund anything; a refund is always a human decision.
- Do not run the sweep against the live PSP during development.
- Do not let the sweep hold a database transaction open across a network call to the PSP.

FINAL REPORT
Report: the sweep's logic and schedule; how it shares PAY-002's settlement function; the
stale-order policy implemented; whether the PSP supports API refunds and what the refund
action therefore does; the four manual sandbox results; what is audited.
```

---

## Phase 10 — Load & stress testing

### LOAD-001

```text
TASK ID: LOAD-001
TITLE: k6 catalog load and spike test
PRIORITY: P1
PREREQUISITES: PERF-002, REL-001

CONTEXT
Top Oil's expected traffic, as reasoned in the production-readiness assessment and recorded
in PERFORMANCE-BASELINE.md (BASE-001), is roughly: 10,000 daily users, ~60,000 page views a
day, ~0.7 rps flat, ~3 rps at the evening peak, and 20-50 rps for a few minutes when a
campaign or an Instagram post lands. Those are ASSUMPTIONS. This task replaces them with
measurements against the real application.

The system is one Next.js container plus one PostgreSQL container on a shared VPS behind
Caddy. PERF-002 added caching to the catalog reads; REL-001 added a health endpoint. The
expected bottleneck is Node CPU rendering React, not the database.

The SLO to test against, from the assessment:
  - p95 < 500 ms on PLP and PDP at 25 rps sustained for 5 minutes;
  - error rate < 0.5% at that load;
  - Postgres connections stay within the configured pool ceiling.

BEFORE CHANGING CODE
- Read PERFORMANCE-BASELINE.md — it defines the paths and the SLOs.
- Read CLAUDE.md and AGENTS.md.
- Read the storefront routes being tested and PERF-002's caching decisions — a load test
  that hits one URL repeatedly measures the cache, not the app.
- Read REL-005's pool configuration if it landed.
- Decide where to run this. NOT against the production VPS — a load test on a shared box
  degrades the neighbours' sites, which DEPLOYMENT.md §1 explicitly warns against. Use a
  local production build or a staging equivalent, and say which.

IMPLEMENTATION
1. Add k6 scripts under a new top-level `load/` directory (a new top-level folder is
   justified here — it is not application code and does not belong in scripts/, which holds
   tsx maintenance scripts; note the choice in the file header per CLAUDE.md's "every folder
   has a clear purpose").
2. Write a REALISTIC journey, not a single-endpoint hammer. Model the actual funnel:
   home -> car finder (4 steps) -> fitment results -> PDP -> PLP browse -> another PDP,
   with think time between steps, and a realistic mix of URLs drawn from real slugs (read
   them from the database into a data file, do not hardcode three). A test that requests one
   product 10,000 times measures nothing useful once PERF-002 is in place.
3. Three scenarios:
   - steady: 3 rps for 10 minutes (the expected evening peak);
   - target: 25 rps for 5 minutes (the SLO);
   - spike: ramp 0 -> 50 rps over 30 seconds, hold 2 minutes, ramp down (the campaign case).
4. Encode the SLOs as k6 thresholds so the test PASSES or FAILS rather than producing a
   graph someone has to interpret.
5. Capture, during each run: p50/p95/p99 per endpoint, error rate, requests/sec achieved,
   container CPU and memory (`docker stats`), Postgres connection count and any slow queries,
   and whether the health endpoint stayed green throughout.
6. Find the knee: increase load until the SLO breaks, and record the number. "It handles 25
   rps" is less useful than "it degrades at N rps, and here is what breaks first".
7. Write the results into PERFORMANCE-BASELINE.md (a new section) or a sibling
   LOAD-TEST-RESULTS.md, including the exact commands so it can be re-run after any
   performance change.

VALIDATION
- All three scenarios run to completion.
- The target scenario's thresholds pass, or the failure is documented with the specific
  bottleneck identified (CPU? connections? a specific slow query?).
- Results are reproducible: run the target scenario twice and confirm comparable numbers.
- No test was run against production.

ACCEPTANCE CRITERIA
- k6 scripts exist for all three scenarios, modelling a realistic journey with real slugs.
- SLOs are encoded as thresholds.
- p50/p95/p99, error rate, CPU, memory and DB connections are recorded for each run.
- The breaking point is identified with a number and a named first-failing component.
- Results and re-run instructions are committed.

DO NOT
- Do not run load tests against the production VPS.
- Do not hammer a single URL — model the funnel.
- Do not add k6 to package.json dependencies (it is a separate binary).
- Do not test checkout here — that is LOAD-002, which needs different setup and cleanup.
- Do not tune the application during this task; measure, report, and let a follow-up task fix.

FINAL REPORT
Report: where the tests were run; the three scenarios' results with p50/p95/p99, error rate,
CPU, memory and DB connections; whether the SLO thresholds passed; the breaking point and
what failed first; where the results and re-run instructions are committed.
```

---

### LOAD-002

```text
TASK ID: LOAD-002
TITLE: Checkout and inventory concurrency test
PRIORITY: P0
PREREQUISITES: ORD-001, ORD-002

CONTEXT
This is the load test that actually matters for an e-commerce site, and it is P0 while
LOAD-001 is P1 — because it tests correctness under concurrency, not speed.

Top Oil's checkout has two protections that must be proven, not assumed:
  - server/order.ts decrements stock inside a prisma.$transaction using a conditional
    `inventory.updateMany({ where: { productId, stock: { gte: quantity } } })` and throws
    when the affected count is not 1. This is meant to make overselling impossible.
  - ORD-001 added an idempotency key with a unique constraint, meant to make a replayed
    submission return the same order rather than creating a second.
  - ORD-002 made cancellation restore stock, meant to happen exactly once.

Order volume is low (~150/day, under one per minute at peak), so throughput is NOT the
question here. The question is whether these three invariants hold when requests collide.

BEFORE CHANGING CODE
- Read server/order.ts createStorefrontOrder in full, especially the transaction.
- Read ORD-001's idempotency implementation and ORD-002's cancellation transaction.
- Read app/api/storefront/orders/route.ts, including its rate limit — a concurrency test
  will trip the checkout limiter, so decide deliberately how to handle that (raise it in the
  test environment only, or key the test's requests appropriately) and NEVER by weakening
  the production configuration.
- Read lib/validation/storefront.ts storefrontOrderCreateSchema for the exact payload shape.
- Read e2e/global-setup.ts and scripts/e2e-reset-db.ts for how a clean test database is
  prepared, and note the SEED_RESET guard that exists because a seed once destroyed real data.

IMPLEMENTATION
1. Set up an isolated environment: a dedicated database (the e2e one on port 5435 is the
   natural candidate) seeded with a product whose stock is a known, small number. NEVER run
   this against the dev or production database.
2. Test 1 — OVERSELL. Set a product's stock to exactly 1. Fire N concurrent checkouts (N =
   50) for that product, all for quantity 1, each with its own idempotency key. Assert:
   - exactly ONE order was created;
   - final stock is exactly 0, never negative;
   - the other 49 received a 409 CheckoutRejectedError, not a 500;
   - no partial order exists (no Order row without its OrderItems, no stock moved without an
     order).
3. Test 2 — IDEMPOTENCY. Fire N concurrent requests with the SAME idempotency key and the
   same payload. Assert exactly one Order exists, stock moved exactly once, and every
   response describes that same order.
4. Test 3 — MIXED. Concurrent checkouts across several products with varying stock, some
   sufficient and some not, run together. Assert every product's final stock equals
   (initial - sum of successful order quantities) exactly, with no drift.
5. Test 4 — CANCEL RACE. Place orders, then fire concurrent cancellations of the same order.
   Assert stock is restored exactly once and the second cancellation is rejected.
6. Test 5 — CLEANUP INVARIANT. After all of the above, assert the global invariant across
   the test dataset: for every product, initial_stock == current_stock + sum(ordered
   quantities in non-cancelled orders). This is the check that catches drift the individual
   tests miss.
7. Implement as a script under load/ (alongside LOAD-001) or as a Vitest integration test —
   choose based on whether you need real HTTP concurrency (the rate limiter and the route
   handler are part of what you are testing, so real HTTP is the stronger test). Say which
   you chose and why.
8. Make it re-runnable: reset the dataset at the start of each run, and make it obvious how
   to run it (a package.json script or a documented command).

VALIDATION
- All five tests pass.
- Run the whole suite three times; results identical each time. A concurrency bug that
  appears one run in three is still a bug — if you see ANY variation, investigate before
  declaring success.
- Confirm final database state by direct query, not by trusting the API's responses.
- Confirm the production rate-limit configuration was not modified.

ACCEPTANCE CRITERIA
- Overselling is proven impossible under 50-way concurrency.
- Stock never goes negative.
- Concurrent identical submissions produce exactly one order.
- Concurrent cancellations restore stock exactly once.
- The global stock invariant holds after the full suite.
- Three consecutive runs give identical results.

DO NOT
- Do not run against the development or production database.
- Do not weaken the production rate limit to make the test pass.
- Do not assert on API responses alone — verify the database state directly.
- Do not accept intermittent passes. Investigate any variation.
- Do not set SEED_RESET=1 against anything but the dedicated test database.

FINAL REPORT
Report: the environment used; each of the five tests and its result; the three-run
consistency check; the final database state verification; any race condition found and
whether it was fixed here or raised as a new task.
```

---

## Phase 11 — Production readiness

### SEC-005

```text
TASK ID: SEC-005
TITLE: Admin multi-factor authentication (TOTP)
PRIORITY: P2
PREREQUISITES: SEC-002

CONTEXT
A single stolen or guessed admin password gives full control of Top Oil: every product
price, every stock figure, every order status, and the contact details of every customer.
The admin panel is at a predictable path (/admin, /login) on a public domain.

Existing protections: bcryptjs hashing, an HTTP-only SameSite=Lax cookie, IP and
per-identifier login throttling (SEC-001, SEC-002), and requireAdmin() re-verification in
all 37 admin route handlers. What is missing is a second factor.

Scope note: this is for ADMIN accounts only. Customers sign in with a phone number to see
their order history; adding MFA there would be friction with no proportionate benefit, and
CLAUDE.md's "avoid over-engineering" applies.

BEFORE CHANGING CODE
- Read CLAUDE.md (Authentication & Security) and AGENTS.md.
- Read lib/auth/ in full: jwt.ts, cookies.ts, password.ts, identifier.ts.
- Read server/auth.ts: authenticate(), getCurrentUser(), requireAdmin().
- Read app/api/auth/login/route.ts and app/(admin)/(auth)/login/LoginForm.tsx.
- Read proxy.ts's admin guard.
- Read prisma/schema.prisma User model and note that role-specific rules live in Zod, not in
  database constraints (see the model's comment) — follow that convention.
- Read the Login frame in top-oil.excalidraw. CLAUDE.md's Wireframe Rules apply: the frame is
  the source of truth for that screen. A second step is a departure from it, so keep the UI
  minimal and in the frame's visual language — do not redesign the login screen.

IMPLEMENTATION
1. Schema: add `totpSecret String?` and `totpEnabledAt DateTime?` to User (nullable — most
   users, all customers, will never have one). The secret must be encrypted at rest, not
   stored plain: a database dump (which DR-001 now creates nightly) otherwise contains every
   admin's second factor. Use a key from an environment variable.
2. Use a well-maintained TOTP library (otpauth or similar — a small, focused dependency).
   Do NOT implement TOTP by hand.
3. Enrollment flow, in the admin Settings area: show the QR/secret once, require the admin to
   enter a valid code before enabling it, and issue single-use recovery codes (hashed in the
   database, shown once). Recovery codes matter — an admin who loses their phone must not be
   locked out of their own shop with no path back.
4. Login flow: after a correct password for a user with TOTP enabled, do NOT issue the
   session cookie yet. Require the code as a second step. Design this carefully:
   - the intermediate state must be short-lived and must not be a usable session;
   - it must not be forgeable from the client;
   - the simplest safe approach is a short-lived, separately-signed token with a distinct
     purpose claim, exchanged for the real session on a correct code. Do not reuse the
     session JWT for this.
5. Rate-limit code verification hard — a 6-digit code is 1,000,000 possibilities and a
   throttle is what makes that a real number. Reuse server/rateLimit.ts's bucket helper.
6. Accept a small time-window drift (±1 step) and reject a code already used within its
   window, so a code observed over someone's shoulder cannot be replayed.
7. Make it optional per account, not mandatory, in this task. Note in the report what it
   would take to require it for all ADMIN accounts, and let the operator decide.
8. Tests: enrollment, correct code, wrong code, replayed code, expired intermediate token,
   recovery code use (and that a used recovery code cannot be reused), and that a user
   without TOTP logs in exactly as before.

VALIDATION
- `pnpm prisma generate`, `pnpm test`, `pnpm lint`, `pnpm tsc --noEmit`, `pnpm build` clean.
- Migration applies to a fresh and a populated database.
- Manual: enroll an admin with a real authenticator app; log out; log in with the code.
- Manual: confirm a wrong code fails and the throttle engages after a few attempts.
- Manual: confirm an admin WITHOUT TOTP still logs in unchanged, and that customer login is
  entirely unaffected.
- Manual: use a recovery code, then confirm it cannot be used a second time.
- Confirm the secret is encrypted in the database (query it directly and look).
- `pnpm test:e2e` — e2e/auth.spec.ts must still pass; update it if enrollment changes the
  flow for the seeded admin.

ACCEPTANCE CRITERIA
- An admin can enroll, and thereafter needs a code to sign in.
- The intermediate post-password state is not a usable session and cannot be forged.
- Code verification is rate-limited and replay-resistant.
- Recovery codes work once each.
- TOTP secrets are encrypted at rest.
- Accounts without TOTP, and all customer logins, are unaffected.

DO NOT
- Do not implement TOTP yourself.
- Do not store the TOTP secret in plaintext.
- Do not require MFA for customer accounts.
- Do not issue the real session cookie before the second factor is verified.
- Do not make MFA mandatory in this task.
- Do not redesign the login screen beyond adding the second step.

FINAL REPORT
Report: the library chosen; how the secret is encrypted and where the key lives; the
intermediate-state mechanism and why it is safe; the recovery-code design; all seven test
results; the E2E outcome; what making it mandatory would require.
```

---

### SCALE-001

```text
TASK ID: SCALE-001
TITLE: Document the blockers to running a second application instance
PRIORITY: P3
PREREQUISITES: RATE-001

CONTEXT
Top Oil runs as ONE application container on a shared VPS. At the projected scale — ~10,000
daily users, ~3 rps at peak, under one order per minute — a second instance is not needed
for throughput. It would be worth having for AVAILABILITY, so that a deploy or a crash is
not an outage.

Two things in the codebase currently prevent it, and both are correct decisions for today
that would become bugs tomorrow:
  1. server/rateLimit.ts is an in-memory fixed-window limiter with per-process Maps. Its own
     comment says so: "sufficient for a single-instance VPS deployment; would need a shared
     store (e.g. Redis) if this app is ever run across multiple instances." With two
     instances, every limit doubles and a determined client can round-robin between them.
  2. server/upload.ts writes to public/uploads on local disk, mounted as the `uploads`
     Docker volume. Two instances on one host can share that volume; two instances on two
     hosts cannot, and an image uploaded to one would 404 from the other.

There may be others. Finding them is the point of this task.

OBJECTIVE
Write down, accurately and completely, what would have to change to run more than one
instance — so that the decision can be made later on evidence rather than guesswork. This is
a DOCUMENTATION task. Implement nothing.

BEFORE CHANGING CODE
- Read DEPLOYMENT.md in full.
- Read server/rateLimit.ts and its single-instance comment.
- Read server/upload.ts and the Dockerfile's uploads mount point.
- Read lib/db.ts and REL-005's pool arithmetic — connection count multiplies by instance.
- Read docker-compose.prod.yml, especially the comment on the one-shot `migrate` service
  explaining it was kept separate precisely so migrations run once "even if app is later
  scaled to multiple replicas". That foresight is already there; verify it holds.
- Search for any other per-process state: module-level caches, in-memory Maps, singletons,
  anything under lib/ or server/ that assumes one process. grep for `new Map(`, `globalThis`,
  and module-scope `let`.
- Read PERF-002's caching — Next's data cache is per-instance, which affects invalidation
  timing across replicas.

IMPLEMENTATION
1. Audit and enumerate every piece of per-process state. For each, record: what it is, where
   it lives, what breaks with two instances, and what the fix would be.
2. Assess Next.js's own requirements: the standalone server is stateless for requests, but
   the data cache and any ISR output are per-instance. Note what that means for PERF-002's
   revalidation (a tag revalidated on instance A does not clear instance B's cache) and what
   the options are.
3. Assess sessions: the JWT is stateless, so sessions themselves need nothing. Verify that
   claim rather than assuming it, and say so.
4. Assess the database: state the pool arithmetic from REL-005 and what max_connections
   allows.
5. Assess Caddy: what the site block would need to become to balance across two upstreams,
   and whether sticky sessions are required (they should not be — say why, or why not).
6. Write it as a new section in DEPLOYMENT.md, "Running more than one instance", containing:
   the complete blocker list with fixes, the order they would have to be done in, an honest
   estimate of the work, and — most importantly — the TRIGGER: the measured condition
   (from LOAD-001's breaking point) at which a second instance becomes worth the complexity.
7. State the recommendation plainly. Based on the projected scale, that recommendation
   should almost certainly be "do not do this yet, and here is what would change our mind".

VALIDATION
- The blocker list is complete: verified by the code search in step 1, not by memory.
- Someone who has never seen the codebase could read the section and understand what would
  need to change.
- No application code was modified.

ACCEPTANCE CRITERIA
- Every piece of per-process state is enumerated with its fix.
- The Next cache, session, database and reverse-proxy implications are each addressed.
- A measured trigger condition is stated, referencing LOAD-001's results.
- A clear recommendation is given.
- Zero code changes.

DO NOT
- Do not implement any of it.
- Do not add Redis, a load balancer, or a shared cache.
- Do not change server/rateLimit.ts or server/upload.ts.
- Do not recommend a second instance on the strength of the "10,000 users" figure alone —
  that number does not require one.

FINAL REPORT
Report: the complete blocker list with fixes; the per-process state your code search found
(including anything not already known); the trigger condition; your recommendation; where in
DEPLOYMENT.md it is documented.
```

---

### PROD-001

```text
TASK ID: PROD-001
TITLE: Go-live review
PRIORITY: P0
PREREQUISITES: all P0 tasks (BASE-001, BASE-002, SEC-001, ORD-001, ORD-002, DR-001, DR-002,
LOAD-002, and PAY-001..003 if a payment gateway was chosen)

CONTEXT
This is the final gate before Top Oil takes real orders from real customers at oil-top.ir.
Every preceding task changed something; this one verifies the whole system as it now stands,
end to end, and produces the written record of what was checked.

It is a VERIFICATION task. If it finds a problem, it does not fix it — it reports it and
recommends a task. Fixing things during a go-live review is how untested changes reach
production.

Context on what should already exist: rate limiting keyed on a trustworthy client IP
(SEC-001); idempotent checkout (ORD-001); stock restored on cancellation (ORD-002); backups
that have actually been restored (DR-001, DR-002); proven-correct behaviour under checkout
concurrency (LOAD-002); a scale baseline (BASE-001); and a recorded payment decision
(BASE-002).

BEFORE CHANGING CODE
- Read this entire task list document and note which tasks were completed and which were not.
- Read CLAUDE.md, AGENTS.md, DEPLOYMENT.md, PERFORMANCE-BASELINE.md, docs-payment-decision.md
  and the recovery runbook from DR-002.
- Read git log since the production-readiness work started, to see what actually changed.

IMPLEMENTATION
Work through each area and record PASS / FAIL / NOT APPLICABLE with evidence. Evidence means
a command output, a screenshot, or a specific file and line — not "looks fine".

1. SECRETS AND CONFIGURATION
   - `git log -p` and `git ls-files` confirm no secret was ever committed, including in
     history. Check .env.production is on the VPS only.
   - Every variable in .env.production.example is set on the VPS with a real value, and
     JWT_SECRET is a long random string, not the example.
   - NODE_ENV=production, so the auth cookie's `secure` flag is actually on.
2. AUTHENTICATION AND AUTHORIZATION
   - Re-verify requireAdmin() in every app/api/admin/**/route.ts (script it — do not read 37
     files by eye).
   - Confirm proxy.ts guards /admin and the protected account paths.
   - Confirm an authenticated CUSTOMER cannot reach any admin API route.
   - Confirm a customer cannot read another customer's order (IDOR).
3. RATE LIMITING — confirm SEC-001's fix is deployed and the header-spoofing bypass is
   closed against the LIVE site, not just locally.
4. ORDER AND MONEY CORRECTNESS
   - Re-run LOAD-002's concurrency suite against a staging copy; confirm all five tests pass.
   - Confirm no client-supplied price, total or discount can influence a charge — re-read
     createStorefrontOrder and try to break it with a crafted request.
   - If a payment gateway is live: confirm a forged callback with a wrong amount is rejected.
5. DATA PROTECTION
   - Confirm backups ran last night, are encrypted, and reached the off-box destination.
   - Confirm the DR-002 runbook is current and its RTO/RPO figures are stated.
   - Confirm the database has no publicly reachable port: from OUTSIDE the VPS, attempt to
     connect to Postgres and confirm it fails.
6. TRANSPORT AND HEADERS
   - `curl -I https://oil-top.ir` — TLS valid, HSTS present, CSP present and enforced,
     X-Frame-Options, X-Content-Type-Options, Referrer-Policy present.
   - Confirm http:// redirects to https:// and www redirects to the apex.
   - Check the certificate's expiry and that Caddy's auto-renewal is working.
7. OPERATIONS
   - /api/health returns 200; stop the database on staging and confirm 503.
   - Confirm the container healthcheck, resource limits and log rotation are active
     (`docker inspect`).
   - Confirm monitoring alerts actually fire (send a test).
8. APPLICATION BEHAVIOUR — walk the real site in both locales and both themes:
   home, car finder end to end, PLP with filters, PDP, add to cart, guest checkout, customer
   registration, login, order history, admin login, product edit, inventory adjustment, order
   status change. Note anything that errors or looks wrong.
9. DEPENDENCIES — `pnpm audit`; confirm the remaining advisories are the triaged, justified
   set from CI-002 and that nothing new appeared.
10. ROLLBACK — confirm the DEPLOYMENT.md §7 redeploy procedure has a working rollback, and
    that it has been tested at least once. If it has not, that is a FAIL.

Then write PRODUCTION-READINESS-REVIEW.md at the repo root containing: the date, the commit
reviewed, every check with PASS/FAIL/N/A and its evidence, a list of every FAIL with a
recommended task, and a clear GO or NO-GO recommendation with the reasoning.

VALIDATION
- Every one of the ten areas has a recorded result with evidence.
- Every FAIL has a recommended follow-up task, not a fix applied during the review.

ACCEPTANCE CRITERIA
- PRODUCTION-READINESS-REVIEW.md exists and covers all ten areas with evidence.
- The external Postgres reachability test and the live rate-limit-bypass test were performed
  against the real deployment.
- A GO or NO-GO recommendation is stated plainly, with reasons.
- No code was changed during the review.

DO NOT
- Do not fix problems during this review. Report them.
- Do not mark anything PASS without evidence.
- Do not skip the checks that must run against the live site.
- Do not run destructive tests (load tests, concurrency suites) against production — use
  staging, and say which environment each result came from.
- Do not issue a GO while any P0 task is incomplete.

FINAL REPORT
Report: the review document's location; the count of PASS/FAIL/N/A; every FAIL with its
recommended task; the GO or NO-GO recommendation and the reasoning behind it.
```

---

# E. Summary of changes from the original checklist

## Added (not in the checklist)

| Added                                         | Why                                                                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BASE-002` payment model decision             | The checklist's entire §7 assumes a payment integration. This project has none, and `paymentStatus` is unwritable. Nothing in that area can be specified until this is answered. |
| `ORD-002` stock restoration on cancellation   | A live bug found during inspection: cancelling an order permanently destroys inventory. The checklist has no item for it.                                                        |
| `ORD-003` writable `paymentStatus`            | Discovered during inspection — the field exists, is displayed to customers, and can never change.                                                                                |
| `PERF-005` proxy self-fetch removal           | Found by reading `proxy.ts`: an HTTP round-trip to the app's own API on every hit to `/`.                                                                                        |
| `OBS-001` admin audit log                     | The checklist mentions audit logs once, under monitoring. Here it is a data-integrity requirement — prices and stock are mutable with no trail.                                  |
| Uploads backup in `DR-001`                    | The checklist covers database backup and never mentions user-uploaded media. Product photographs live only on a Docker volume.                                                   |
| `SCALE-001`                                   | Records the blockers to horizontal scaling instead of building for it — the honest middle path between "ignore it" and "over-engineer for it".                                   |
| Iranian-infrastructure constraints throughout | The checklist's CDN/WAF/error-tracking items silently assume Western SaaS. `REL-004` and `OBS-002` are written to verify reachability first.                                     |
| Encryption of backups                         | The checklist says "backup encryption" in one bullet; here it is load-bearing, because the dump is a customer database with names, phone numbers and addresses.                  |

## Removed (in the checklist, deliberately not done)

| Removed                                                            | Why                                                                                                                                              |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Read replicas, sharding, PgBouncer                                 | 3,469 products, <1 GB database, one order per minute at peak. Three orders of magnitude of unnecessary complexity.                               |
| Kubernetes, microservices, service mesh, event-driven architecture | Explicitly excluded by the checklist's own Rule 3, and correctly so.                                                                             |
| Redis                                                              | One process means an in-memory map _is_ a shared cache. `SCALE-001` records the trigger for revisiting.                                          |
| Auto-scaling, load balancing, multiple instances                   | Not needed for the projected traffic. Replaced by `SCALE-001`, which documents the blockers so the option stays open.                            |
| WAF / DDoS appliance                                               | Not proportionate, and an Iranian-infrastructure question rather than a code change. Replaced by Caddy-level and app-level limits in `RATE-001`. |
| Point-in-time recovery / WAL archiving                             | Nightly encrypted dumps give RPO ≈ 24h, which is adequate at this order volume and far simpler to operate. Revisit at ~100 orders/day.           |
| Subresource Integrity                                              | Zero third-party scripts. Nothing to apply it to.                                                                                                |
| Circuit breakers                                                   | No external service calls exist. Revisit when the PSP and an SMS provider do.                                                                    |
| Refresh tokens                                                     | This app uses one 7-day JWT deliberately. The real gap behind that bullet is session revocation, folded into `SEC-002`.                          |
| Prometheus / Grafana / Loki                                        | The VPS is shared with other sites. Structured stdout logs plus external uptime probing is the right size.                                       |
| Cache stampede prevention                                          | Next's data cache dedupes concurrent requests for the same key. Nothing to add.                                                                  |

## Changed

- **Phase order.** The checklist's Rule 10 puts caching (Phase 4) before traffic protection
  (Phase 5) and backups near the end (Phase 8). Here **backups are P0 and near the front** —
  they protect weeks of irreplaceable import work, and the checklist's own "test recovery
  instead of assuming backups work" deserves to outrank a caching improvement.
- **Rate limiting moved earlier and reframed.** The checklist treats it as a Phase 5
  feature to add. Here it is a Phase 1 _fix_, because the feature already exists and is
  bypassable — which is worse than not having it, since it is currently trusted.
- **Load testing split by purpose.** `LOAD-002` (correctness under concurrency) is P0 and
  gates launch; `LOAD-001` (throughput) is P1 and does not. The checklist treats them as one
  undifferentiated block.
- **"10,000 users" made concrete.** Replaced with a table of derived figures (§B.3), each
  labelled as an assumption, plus SLOs that `LOAD-001` and `LOAD-002` assert against.
- **Every task now names real files.** The checklist is abstract; each prompt below points
  at the specific modules, comments and conventions a fresh session needs to read first.

## Blocking production vs. can wait

**Blocking** (the site must not take a real order until these are done): `BASE-001`,
`BASE-002`, `SEC-001`, `ORD-001`, `ORD-002`, `DR-001`, `DR-002`, `LOAD-002`, `PROD-001`,
plus `PAY-001`–`PAY-003` if a gateway was chosen.

**First weeks of traffic**: `SEC-002`, `SEC-003`, `ORD-003`, `ORD-004`, `REL-001`–`REL-003`,
`PERF-001`, `PERF-002`, `RATE-001`, `OBS-001`, `CI-001`, `LOAD-001`.

**When traffic grows**: `SEC-004`, `SEC-005`, `REL-004`, `REL-005`, `PERF-003`–`PERF-005`,
`OBS-002`, `CI-002`, `SCALE-001`.
