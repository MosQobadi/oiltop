// Everything in this project that talks to somebody else's web server goes
// through here. Four concerns, written once because four copies would mean
// three of them are wrong:
//
//   1. A DISK CACHE, so re-running a scraper costs nothing. Parsing thousands
//      of pages takes several attempts, and re-downloading the site on each one
//      is both slow and rude. A second run does zero network requests.
//   2. A RATE LIMIT of one request per second per host, serialised. The catalog
//      is a few thousand pages; finishing in an hour instead of ten minutes
//      costs nothing, and being blocked mid-run costs a lot.
//   3. ROBOTS.TXT, checked before the first request to a host and never
//      bypassable. If a host disallows what we need, that is a decision for a
//      person to make, not a flag to pass.
//   4. A REAL BROWSER, because one of our two sources cannot be read without
//      one — see below.
//
// **Why a browser and not fetch().** oil-city.ir sits behind ArvanCloud, which
// answers a plain HTTP client with a ~6KB JavaScript "Transferring to the
// website..." page — at HTTP 200, for every URL including robots.txt and the
// sitemaps. Nothing readable comes back. Chrome runs the script and gets the
// real page: 297KB of car data, and a robots.txt that plain fetch never sees at
// all. This is the ordinary way the site serves any visitor, not a defeat of
// anything; the interstitial is a redirect shim, not a CAPTCHA. If a source
// ever escalates to a real challenge, that is a full stop, not a puzzle to
// solve.
//
// Chrome costs a second or two per page, which is free here: the rate limit
// already makes us wait longer than that, and the cache means we pay it once.
//
// The cache lives under `scrape/.cache/<host>/`, which .gitignore already
// covers via `/scrape/`. Everything in it is disposable — delete the directory
// to force a refetch.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Browser, type BrowserContext, chromium } from "@playwright/test";

/** A 4xx, or a 5xx that survived its retries. Carries the status so a caller can record it. */
export class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`${url} returned HTTP ${status}`);
  }
}

/**
 * The host's robots.txt forbids this path, or could not be read at all.
 * Deliberately the same error for both: "we are not allowed" and "we cannot
 * tell whether we are allowed" have the same correct response, which is to stop.
 * There is no override.
 */
export class RobotsDisallowedError extends Error {}

// An honest User-Agent naming the project, not a spoofed browser string. Set
// SCRAPE_USER_AGENT to add a contact address before running at any scale — a
// host that wants to complain should have somewhere to complain to.
const USER_AGENT =
  process.env.SCRAPE_USER_AGENT ?? "TopOilBot/1.0 (+https://oil-top.ir; catalog import)";

// The token robots.txt groups are matched against, lowercased.
const USER_AGENT_TOKEN = "topoilbot";

const CACHE_ROOT = path.join("scrape", ".cache");
const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;
const NAVIGATION_TIMEOUT_MS = 45_000;
// Long enough for the CDN shim described at the top of this file, which took
// about four seconds when measured against oil-city.ir.
const INTERSTITIAL_TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsRules {
  rules: RobotsRule[];
  crawlDelayMs: number | null;
}

/**
 * Parses robots.txt down to the rules that apply to us: the group naming our
 * token if there is one, otherwise the `*` group. Groups for other crawlers are
 * ignored, which is what the format means by a group.
 */
export function parseRobots(text: string, userAgentToken = USER_AGENT_TOKEN): RobotsRules {
  const forUs: RobotsRule[] = [];
  const forEveryone: RobotsRule[] = [];
  let delayForUs: number | null = null;
  let delayForEveryone: number | null = null;

  // Which groups the lines currently being read belong to. Consecutive
  // User-agent lines share one group, so both flags can be true at once.
  let matchesUs = false;
  let matchesEveryone = false;
  let inAgentBlock = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // A User-agent line after rules starts a fresh group.
      if (!inAgentBlock) {
        matchesUs = false;
        matchesEveryone = false;
        inAgentBlock = true;
      }
      const token = value.toLowerCase();
      if (token === "*") matchesEveryone = true;
      else if (token === userAgentToken) matchesUs = true;
      continue;
    }

    inAgentBlock = false;

    if (field === "disallow" || field === "allow") {
      // "Disallow:" with an empty value means "nothing is disallowed", which is
      // the opposite of "Disallow: /" and must not be treated as a rule.
      if (field === "disallow" && value === "") continue;
      const rule: RobotsRule = { allow: field === "allow", pattern: value };
      if (matchesUs) forUs.push(rule);
      if (matchesEveryone) forEveryone.push(rule);
      continue;
    }

    if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        if (matchesUs) delayForUs = seconds * 1000;
        if (matchesEveryone) delayForEveryone = seconds * 1000;
      }
    }
  }

  // A group naming us replaces the wildcard group entirely rather than adding
  // to it — that is what the format means by the most specific group winning.
  const hasOwnGroup = forUs.length > 0 || delayForUs !== null;
  return hasOwnGroup
    ? { rules: forUs, crawlDelayMs: delayForUs }
    : { rules: forEveryone, crawlDelayMs: delayForEveryone };
}

/**
 * Whether a response body is plausibly robots.txt at all.
 *
 * This exists because of a specific near-miss: oil-city.ir's CDN answers with
 * an HTML interstitial at status 200. Parsed as robots.txt that yields zero
 * rules, which reads as "nothing is forbidden" — the most permissive possible
 * conclusion drawn from a page that never contained any rules. An empty ruleset
 * must come from an empty robots.txt, not from failing to fetch one.
 *
 * It judges the BODY and ignores the response headers, which was itself a bug
 * once: the interstitial is the response `page.goto()` returns, so its
 * `content-type: text/html` describes the shim rather than the robots.txt the
 * browser ends up holding once the shim's script has run.
 */
export function looksLikeRobotsTxt(body: string): boolean {
  const trimmed = body.trim();
  // A genuinely empty robots.txt is a valid robots.txt meaning "no rules".
  if (trimmed === "") return true;
  // Markup is never robots.txt, whatever directives its prose might contain.
  if (trimmed.startsWith("<")) return false;
  return /^\s*(user-agent|allow|disallow|sitemap|crawl-delay)\s*:/im.test(trimmed);
}

function patternMatches(pattern: string, target: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(target);
}

/**
 * Whether `target` — a path INCLUDING its query string, since robots patterns
 * routinely end in `?` to exclude parameterised URLs — is allowed. The longest
 * matching pattern wins, and Allow beats Disallow at equal length, both per the
 * robots.txt spec. Returns the rule that forbids it, so the error can quote it.
 */
export function isAllowedByRobots(robots: RobotsRules, target: string): RobotsRule | null {
  let winner: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!patternMatches(rule.pattern, target)) continue;
    if (
      winner === null ||
      rule.pattern.length > winner.pattern.length ||
      (rule.pattern.length === winner.pattern.length && rule.allow && !winner.allow)
    ) {
      winner = rule;
    }
  }
  // Nothing matched means nothing forbids it.
  return winner !== null && !winner.allow ? winner : null;
}

/** The string robots rules are matched against: path plus query, never the path alone. */
export function robotsTargetFor(url: URL): string {
  return `${url.pathname}${url.search}`;
}

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

let browserPromise: Promise<Browser> | null = null;

function browser(): Promise<Browser> {
  // `channel: "chrome"` uses the Chrome already on the machine, which is what
  // playwright.config.ts does too — this project never downloads Playwright's
  // own browser builds, so asking for one would fail.
  browserPromise ??= chromium.launch({ channel: "chrome" });
  return browserPromise;
}

/** Scrapers must call this when finished, or the process will not exit. */
export async function closeBrowser(): Promise<void> {
  // The warmed binary contexts hold the browser open on their own, so they go
  // first — closing the browser out from under them logs a torn-down-context
  // error on the way out.
  const contexts = [...binaryContextByOrigin.values()];
  binaryContextByOrigin.clear();
  await Promise.all(
    contexts.map(async (pending) => (await pending).close().catch(() => undefined)),
  );

  if (browserPromise === null) return;
  const instance = await browserPromise;
  browserPromise = null;
  await instance.close();
}

/**
 * Whether the page currently loaded is ArvanCloud's "transferring to the
 * website" shim rather than the page asked for.
 *
 * Matching a specific CDN's markup is deliberate, and better than the obvious
 * alternative of sleeping a few seconds on every request: the shim takes about
 * four seconds to replace itself, and paying that on all ~4,300 pages would add
 * five hours to a full run for the benefit of the handful that need it. A page
 * that is already real is returned immediately.
 */
export function isCdnInterstitial(html: string): boolean {
  return /cdn-cgi\/assets\/css\/static-pages|error-section--waiting/i.test(html);
}

interface Fetched {
  status: number;
  body: string;
  /** The rendered text, always — `body` may be markup, and markup is a poor emptiness test. */
  text: string;
  /** True when Chrome served its own error page instead of the site's. */
  isBrowserError: boolean;
}

/**
 * Chrome's "This site can't be reached" page, which it renders in place of the
 * document when the connection fails.
 *
 * It has to be recognised explicitly because it does not look like a failure
 * from the outside: `page.goto()` resolves, the document is a perfectly valid
 * 188KB of HTML, and it caches like any other page — after which every later run
 * returns the error page instantly and forever. Found in a real run, where three
 * products had cached an ERR_CONNECTION_RESET page as their content.
 */
function isBrowserErrorPage(url: string, text: string): boolean {
  if (url.startsWith("chrome-error://")) return true;
  return /ERR_[A-Z_]+|This site can.t be reached/.test(text);
}

async function loadInBrowser(url: string, asText: boolean): Promise<Fetched> {
  const context = await (await browser()).newContext({ userAgent: USER_AGENT });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    // The shim swaps itself for the real page once its script runs. Polling for
    // that beats a fixed delay in both directions: no wait at all for a page
    // that arrived intact, and no truncated read for one that took longer than
    // a guess would have allowed.
    // Two separate things have to finish before the page is worth reading, and
    // conflating them cost a whole scrape once.
    //
    //   1. The shim has to swap itself for the real page.
    //   2. The body has to actually contain something. The XML sitemaps are
    //      served with an XSL stylesheet, so Chrome renders them into a
    //      document whose text appears AFTER the load event — "the document
    //      arrived" and "there is anything in it" are different questions, and
    //      reading between the two returns an empty string.
    //
    // `page.content()` also throws outright while a navigation is in flight,
    // which is exactly what the shim does on its way out, so a throw counts as
    // "still settling" rather than as a failure.
    const settled = async () => {
      try {
        if (isCdnInterstitial(await page.content())) return false;
        const text = await page.evaluate(() => document.body?.innerText ?? "");
        return text.trim() !== "";
      } catch {
        return false;
      }
    };

    const deadline = Date.now() + INTERSTITIAL_TIMEOUT_MS;
    while (!(await settled()) && Date.now() < deadline) {
      await page.waitForTimeout(250);
    }
    await page.waitForLoadState("domcontentloaded");

    const text = await page.evaluate(() => document.body?.innerText ?? "");

    return {
      status: response?.status() ?? 0,
      text,
      isBrowserError: isBrowserErrorPage(page.url(), text),
      // robots.txt and XML sitemaps are served as text and wrapped by Chrome
      // for display; innerText gives back what was actually sent, where
      // page.content() would hand over Chrome's viewer markup around it.
      body: asText ? text : await page.content(),
    };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Per-host state: robots, and the rate limiter's queue
// ---------------------------------------------------------------------------

const robotsByHost = new Map<string, Promise<RobotsRules>>();
const queueByHost = new Map<string, Promise<unknown>>();
const lastRequestAtByHost = new Map<string, number>();

async function loadRobots(origin: string): Promise<RobotsRules> {
  const { status, body } = await loadInBrowser(`${origin}/robots.txt`, true);

  // No robots.txt means no restrictions — that is what its absence means.
  if (status === 404 || status === 410) return { rules: [], crawlDelayMs: null };

  // A server error is NOT permission. "Disallow everything" is what the spec
  // asks for and the only safe reading of "we can't tell".
  if (status < 200 || status >= 300) {
    throw new RobotsDisallowedError(
      `${origin}/robots.txt returned HTTP ${status}, so permission to crawl cannot be established`,
    );
  }
  if (!looksLikeRobotsTxt(body)) {
    throw new RobotsDisallowedError(
      `${origin}/robots.txt did not return robots.txt — the body is not a rules file, which ` +
        `usually means a CDN interstitial answered instead. Permission to crawl cannot be ` +
        `established, so nothing will be fetched from this host.`,
    );
  }
  return parseRobots(body);
}

function robotsFor(origin: string): Promise<RobotsRules> {
  let cached = robotsByHost.get(origin);
  if (cached === undefined) {
    cached = loadRobots(origin);
    robotsByHost.set(origin, cached);
  }
  return cached;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `task` after the host's rate-limit gap has elapsed, with requests to one
 * host strictly serialised. Chaining onto the host's promise is what makes it
 * serial: two callers never sit in the gap at the same time.
 */
function schedule<T>(host: string, intervalMs: number, task: () => Promise<T>): Promise<T> {
  const previous = queueByHost.get(host) ?? Promise.resolve();
  const next = previous.then(async () => {
    const last = lastRequestAtByHost.get(host);
    if (last !== undefined) {
      const wait = last + intervalMs - Date.now();
      if (wait > 0) await sleep(wait);
    }
    lastRequestAtByHost.set(host, Date.now());
    return task();
  });
  // Keep the chain alive after a failure, or one bad page stops the host.
  queueByHost.set(
    host,
    next.catch(() => undefined),
  );
  return next;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  url: string;
  fetchedAt: string;
  status: number;
  body: string;
}

/**
 * One self-describing file per URL. The entry carries its own URL, so a cache
 * file found on disk can be traced back to its page without a lookup table.
 */
export function cachePathFor(url: string, cacheRoot = CACHE_ROOT): string {
  const { host } = new URL(url);
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  return path.join(cacheRoot, host, `${hash}.json`);
}

async function readCache(file: string): Promise<CacheEntry | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as CacheEntry;
  } catch {
    // Missing or unreadable is a cache miss, not an error — the cache is
    // disposable by design.
    return null;
  }
}

async function writeCache(file: string, entry: CacheEntry): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(entry), "utf8");
}

// ---------------------------------------------------------------------------

export interface FetchPageOptions {
  /** True for robots.txt and XML sitemaps — see the note in loadInBrowser. */
  asText?: boolean;
  cacheRoot?: string;
}

/**
 * Fetches a URL, honouring the cache, the rate limit and robots.txt.
 *
 * Throws `RobotsDisallowedError` if the host forbids the path or its robots.txt
 * cannot be read, and `HttpStatusError` for a 4xx or an exhausted 5xx —
 * scrapers are expected to record those in their batch's `problems` array
 * rather than skip them silently.
 */
export async function fetchPage(url: string, options: FetchPageOptions = {}): Promise<string> {
  const { asText = false, cacheRoot = CACHE_ROOT } = options;
  const parsed = new URL(url);
  const cacheFile = cachePathFor(url, cacheRoot);

  const cached = await readCache(cacheFile);
  if (cached !== null) return cached.body;

  const robots = await robotsFor(parsed.origin);
  const disallowedBy = isAllowedByRobots(robots, robotsTargetFor(parsed));
  if (disallowedBy !== null) {
    throw new RobotsDisallowedError(
      `${parsed.origin}/robots.txt disallows ${robotsTargetFor(parsed)} — the matching rule is ` +
        `"Disallow: ${disallowedBy.pattern}". This is not overridable in code; if the data is ` +
        `needed anyway, that is a conversation to have with the host.`,
    );
  }

  const interval = Math.max(MIN_INTERVAL_MS, robots.crawlDelayMs ?? 0);

  return schedule(parsed.host, interval, async () => {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const { status, body, text, isBrowserError } = await loadInBrowser(url, asText);

        // A 4xx is an answer, not a hiccup. Retrying one is just noise.
        if (status >= 400 && status < 500) throw new HttpStatusError(status, url);

        // Three ways a fetch can succeed on paper and hold nothing usable. All
        // three are failures that retry, and NONE of them may reach the cache:
        // a cached non-answer is returned instantly and forever, and reports
        // itself as "the page held nothing" rather than "it was never read".
        //
        // Emptiness is judged on the RENDERED TEXT, not the markup. A page that
        // arrives as a shell — correct <title>, 13KB of scaffolding, empty body
        // — is not an empty string, so a markup test passes it and the parser
        // then finds none of the selectors it needs.
        if (isBrowserError) {
          lastError = new Error(`${url} returned Chrome's own error page`);
        } else if (status >= 200 && status < 400 && text.trim() === "") {
          lastError = new Error(`${url} rendered no text`);
        } else if (status >= 200 && status < 400) {
          await writeCache(cacheFile, {
            url,
            fetchedAt: new Date().toISOString(),
            status,
            body,
          });
          return body;
        } else {
          lastError = new HttpStatusError(status, url);
        }
      } catch (error) {
        if (error instanceof HttpStatusError && error.status < 500) throw error;
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS) await sleep(interval * 2 ** attempt);
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  });
}

// ---------------------------------------------------------------------------
// Binary fetching
// ---------------------------------------------------------------------------

/**
 * A browser context per origin that has already been through the CDN shim.
 *
 * `fetchPage` can afford a throwaway context per page because it navigates, and
 * a navigation runs the shim's script and polls until the real page replaces
 * it. Chrome's request API does not run scripts, so a cold context asking for
 * an image gets 6KB of "Transferring to the website..." at HTTP 200 — which is
 * a perfectly valid response holding no image, and it is what the first run of
 * this function actually returned for all twelve files it was given.
 *
 * Navigating once per origin and keeping the context is what fixes it: the shim
 * leaves its clearance cookie in the context, and every later request from the
 * same context carries it. One extra page load per host, not per file.
 */
const binaryContextByOrigin = new Map<string, Promise<BrowserContext>>();

async function openWarmContext(origin: string): Promise<BrowserContext> {
  const context = await (await browser()).newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    const deadline = Date.now() + INTERSTITIAL_TIMEOUT_MS;
    // Same poll as loadInBrowser, and for the same reason: the shim takes about
    // four seconds to swap itself out, and a page that arrived intact costs
    // nothing to check.
    while (Date.now() < deadline) {
      try {
        if (!isCdnInterstitial(await page.content())) break;
      } catch {
        // page.content() throws while a navigation is in flight, which is
        // exactly what the shim does on its way out. Keep polling.
      }
      await page.waitForTimeout(250);
    }
  } finally {
    await page.close();
  }
  return context;
}

function warmedContext(origin: string): Promise<BrowserContext> {
  let existing = binaryContextByOrigin.get(origin);
  if (existing === undefined) {
    existing = openWarmContext(origin);
    binaryContextByOrigin.set(origin, existing);
  }
  return existing;
}

/** Drops a context whose clearance has gone stale, so the next call warms a new one. */
async function discardContext(origin: string): Promise<void> {
  const existing = binaryContextByOrigin.get(origin);
  if (existing === undefined) return;
  binaryContextByOrigin.delete(origin);
  await (await existing).close().catch(() => undefined);
}

/**
 * Where a downloaded binary lives. Raw bytes, not a JSON envelope: images are
 * the only binaries we fetch and base64 in a JSON wrapper would inflate a
 * multi-thousand-file cache by a third for no benefit. The file existing IS the
 * cache hit, so a failed download leaves nothing behind to be mistaken for one.
 */
export function binaryCachePathFor(url: string, cacheRoot = CACHE_ROOT): string {
  const { host } = new URL(url);
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  return path.join(cacheRoot, host, "bin", hash);
}

/**
 * Fetches a URL as bytes, honouring the same cache, rate limit and robots.txt
 * as `fetchPage`.
 *
 * Uses Chrome's request API rather than a navigation: an image is not a
 * document, so there is no shim to poll away and no rendered text to judge
 * emptiness by. It goes through the browser anyway so that the TLS and header
 * profile match the pages we already fetch — a CDN that serves the HTML happily
 * and then 403s a bare Node request for the image it references is a normal
 * thing to run into.
 *
 * Throws the same errors as `fetchPage`, plus a plain Error for a response that
 * is technically fine but holds no bytes.
 */
export async function fetchBinary(url: string, options: FetchPageOptions = {}): Promise<Buffer> {
  const { cacheRoot = CACHE_ROOT } = options;
  const parsed = new URL(url);
  const cacheFile = binaryCachePathFor(url, cacheRoot);

  try {
    return await readFile(cacheFile);
  } catch {
    // Missing or unreadable is a cache miss, same as the text cache.
  }

  const robots = await robotsFor(parsed.origin);
  const disallowedBy = isAllowedByRobots(robots, robotsTargetFor(parsed));
  if (disallowedBy !== null) {
    throw new RobotsDisallowedError(
      `${parsed.origin}/robots.txt disallows ${robotsTargetFor(parsed)} — the matching rule is ` +
        `"Disallow: ${disallowedBy.pattern}". This is not overridable in code; if the data is ` +
        `needed anyway, that is a conversation to have with the host.`,
    );
  }

  const interval = Math.max(MIN_INTERVAL_MS, robots.crawlDelayMs ?? 0);

  return schedule(parsed.host, interval, async () => {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const context = await warmedContext(parsed.origin);
        const response = await context.request.get(url, { timeout: NAVIGATION_TIMEOUT_MS });
        const status = response.status();

        if (status >= 400 && status < 500) throw new HttpStatusError(status, url);
        if (status < 200 || status >= 400) {
          lastError = new HttpStatusError(status, url);
        } else {
          const body = await response.body();
          // Three ways a 200 can hold nothing usable, and none of them may
          // reach the cache — a cached non-answer is returned instantly and
          // forever, and reports itself as "the file was empty" rather than as
          // "it was never read".
          if (body.length === 0) {
            lastError = new Error(`${url} returned an empty body`);
          } else if (isCdnInterstitial(body.subarray(0, 2048).toString("utf8"))) {
            // The shim, at HTTP 200, in place of the bytes. The warm-up should
            // have prevented it; a context can still go stale mid-run, so throw
            // this one away and let the retry build a fresh one.
            await discardContext(parsed.origin);
            lastError = new Error(`${url} returned the CDN interstitial instead of the file`);
          } else {
            await mkdir(path.dirname(cacheFile), { recursive: true });
            await writeFile(cacheFile, body);
            return body;
          }
        }
      } catch (error) {
        if (error instanceof HttpStatusError && error.status < 500) throw error;
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS) await sleep(interval * 2 ** attempt);
    }

    throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
  });
}
