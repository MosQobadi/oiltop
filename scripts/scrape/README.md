# scripts/scrape

Scrapers that produce the batch files `scripts/import.ts` eats. Source code
lives here; **output does not** — it goes to `scrape/<source>/`, which
`.gitignore` excludes wholesale, along with the disk cache at `scrape/.cache/`.
Everything under `scrape/` is reproducible and disposable; delete the cache
directory to force a refetch.

`fetch.ts` is the only thing here that touches the network. It caches to disk,
holds every host to one request per second, obeys robots.txt with no override,
and drives real Chrome — oil-city.ir's CDN answers a plain HTTP client with a
JavaScript interstitial and nothing else, so `fetch()` cannot read that site at
all. Read the comment at the top of the file before changing any of that.

Scrapers must call `closeBrowser()` when they finish, or the process will hang.
