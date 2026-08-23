import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cachePathFor,
  isAllowedByRobots,
  looksLikeRobotsTxt,
  parseRobots,
  robotsTargetFor,
} from "./fetch";

// Convenience: "is this path allowed", since isAllowedByRobots returns the
// offending rule rather than a boolean so the error can quote it.
function allows(robotsTxt: string, pathname: string): boolean {
  return isAllowedByRobots(parseRobots(robotsTxt), pathname) === null;
}

describe("parseRobots", () => {
  it("reads the wildcard group when no group names us", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /wp-admin/");
    expect(robots.rules).toEqual([{ allow: false, pattern: "/wp-admin/" }]);
  });

  it("prefers a group naming us, and ignores the wildcard group entirely", () => {
    const robots = parseRobots(
      ["User-agent: *", "Disallow: /", "", "User-agent: topoilbot", "Disallow: /private/"].join(
        "\n",
      ),
    );
    // Not a merge: our group replaces the wildcard one, so "/" is not inherited.
    expect(robots.rules).toEqual([{ allow: false, pattern: "/private/" }]);
  });

  it("ignores groups for other crawlers", () => {
    const robots = parseRobots(
      ["User-agent: GPTBot", "Disallow: /", "", "User-agent: *", "Disallow: /cart"].join("\n"),
    );
    expect(robots.rules).toEqual([{ allow: false, pattern: "/cart" }]);
  });

  it("applies consecutive user-agent lines to one shared group", () => {
    const robots = parseRobots(["User-agent: bingbot", "User-agent: *", "Disallow: /x"].join("\n"));
    expect(robots.rules).toEqual([{ allow: false, pattern: "/x" }]);
  });

  it("treats an empty Disallow as no rule at all", () => {
    // "Disallow:" means "nothing is disallowed" — the opposite of "Disallow: /".
    expect(parseRobots("User-agent: *\nDisallow:").rules).toEqual([]);
    expect(allows("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });

  it("strips comments and tolerates blank lines", () => {
    const robots = parseRobots("# hello\nUser-agent: *  # everyone\n\nDisallow: /a # nope\n");
    expect(robots.rules).toEqual([{ allow: false, pattern: "/a" }]);
  });

  it("reads Crawl-delay as milliseconds", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 10").crawlDelayMs).toBe(10_000);
    expect(parseRobots("User-agent: *\nDisallow: /a").crawlDelayMs).toBeNull();
  });
});

describe("isAllowedByRobots", () => {
  const wordpress = [
    "User-agent: *",
    "Disallow: /wp-admin/",
    "Allow: /wp-admin/admin-ajax.php",
  ].join("\n");

  it("allows what no rule matches", () => {
    expect(allows(wordpress, "/product/some-oil/")).toBe(true);
  });

  it("disallows a matching prefix", () => {
    expect(allows(wordpress, "/wp-admin/options.php")).toBe(false);
  });

  it("lets a longer Allow win inside a disallowed directory", () => {
    expect(allows(wordpress, "/wp-admin/admin-ajax.php")).toBe(true);
  });

  it("lets Allow win a tie at equal length", () => {
    const robots = ["User-agent: *", "Disallow: /x", "Allow: /x"].join("\n");
    expect(allows(robots, "/x")).toBe(true);
  });

  it("honours * wildcards inside a pattern", () => {
    const robots = ["User-agent: *", "Disallow: /*?s="].join("\n");
    expect(allows(robots, "/?s=oil")).toBe(false);
    expect(allows(robots, "/product/oil")).toBe(true);
  });

  it("honours a $ end anchor", () => {
    const robots = ["User-agent: *", "Disallow: /*.pdf$"].join("\n");
    expect(allows(robots, "/manuals/guide.pdf")).toBe(false);
    expect(allows(robots, "/manuals/guide.pdf.html")).toBe(true);
  });

  it("disallows everything under Disallow: /", () => {
    expect(allows("User-agent: *\nDisallow: /", "/")).toBe(false);
    expect(allows("User-agent: *\nDisallow: /", "/anything/at/all")).toBe(false);
  });

  it("reports the rule that did it, so the error can quote it", () => {
    const rule = isAllowedByRobots(parseRobots(wordpress), "/wp-admin/options.php");
    expect(rule).toEqual({ allow: false, pattern: "/wp-admin/" });
  });
});

// oil-city.ir's real robots.txt, read through a browser — a plain HTTP client
// gets a CDN interstitial instead. Kept verbatim because it is the thing every
// oil-city scraper has to obey.
describe("oil-city.ir's actual rules", () => {
  const oilCity = [
    "User-agent: *",
    "Disallow: /wp-admin/",
    "Disallow: /trackback/",
    "Disallow: /xmlrpc.php",
    "Disallow: /feed/",
    "disallow: /cart",
    "disallow: /compare/*",
    "disallow: /checkout",
    "disallow: /signin",
    "disallow: /signup",
    "disallow: /profile/*",
    "disallow: /*?",
    "Disallow: /*?s=",
    "Allow: /wp-admin/admin-ajax.php",
  ].join("\n");

  const target = (url: string) => robotsTargetFor(new URL(url));

  it.each([
    "https://www.oil-city.ir/products-sitemap.xml",
    "https://www.oil-city.ir/cars-sitemap.xml",
    "https://www.oil-city.ir/product/some-oil/",
    "https://www.oil-city.ir/product-category/products/engine-oil/",
    "https://www.oil-city.ir/product-category/products/engine-oil/page/3/",
    "https://www.oil-city.ir/car/toyota/",
    "https://www.oil-city.ir/car/toyota/chr/",
  ])("allows %s", (url) => {
    expect(allows(oilCity, target(url))).toBe(true);
  });

  // "disallow: /*?" rules out every parameterised URL, which is why enumeration
  // goes through the sitemaps and pagination through /page/{n}/.
  it.each([
    "https://www.oil-city.ir/?s=oil",
    "https://www.oil-city.ir/cart",
    "https://www.oil-city.ir/checkout",
    "https://www.oil-city.ir/product-category/products/engine-oil/?orderby=price",
  ])("blocks %s", (url) => {
    expect(allows(oilCity, target(url))).toBe(false);
  });

  it("matches rules against the query string, not the path alone", () => {
    // The bug this guards: new URL(...).pathname drops "?s=oil" entirely, so
    // matching on the path would let every "/*?" rule pass unnoticed.
    expect(target("https://www.oil-city.ir/?s=oil")).toBe("/?s=oil");
    expect(allows(oilCity, "/")).toBe(true);
  });
});

describe("looksLikeRobotsTxt", () => {
  it("accepts a real robots.txt", () => {
    expect(looksLikeRobotsTxt("User-agent: *\nDisallow: /x")).toBe(true);
  });

  it("accepts a genuinely empty one", () => {
    expect(looksLikeRobotsTxt("")).toBe(true);
  });

  it("rejects an HTML interstitial served at 200", () => {
    // The near-miss this exists for: parsed as robots.txt, a CDN's HTML
    // waiting-page yields zero rules, which reads as "nothing is forbidden".
    const interstitial = "<!DOCTYPE html><html><body>Transferring to the website...</body></html>";
    expect(looksLikeRobotsTxt(interstitial)).toBe(false);
  });

  // Judged on the body alone: the interstitial IS the response page.goto()
  // returns, so its content-type describes the shim, not the robots.txt the
  // browser holds once the shim's script has run.
  it("rejects markup that merely mentions the directives", () => {
    expect(looksLikeRobotsTxt("<html><body>Disallow: /x</body></html>")).toBe(false);
  });
});

describe("cachePathFor", () => {
  it("files an entry under its host", () => {
    const file = cachePathFor("https://www.oil-city.ir/product/x/", "cacheroot");
    expect(file.startsWith(path.join("cacheroot", "www.oil-city.ir"))).toBe(true);
  });

  it("is stable for one URL and distinct between URLs", () => {
    const a = cachePathFor("https://example.com/a", "c");
    expect(cachePathFor("https://example.com/a", "c")).toBe(a);
    expect(cachePathFor("https://example.com/b", "c")).not.toBe(a);
  });

  it("does not collide between hosts sharing a path", () => {
    expect(cachePathFor("https://a.com/p", "c")).not.toBe(cachePathFor("https://b.com/p", "c"));
  });
});
