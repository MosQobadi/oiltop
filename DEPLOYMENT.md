# Deployment — shared Ubuntu VPS (oil-top.ir)

Top Oil runs as **one tenant among several** on an ArvanCloud VPS that is
already serving other sites. Everything below is written around that single
constraint: nothing in this stack may take a port, a config file, a firewall
rule, a container name or a volume that another project is already using.

The pieces: `Dockerfile`, `docker-compose.prod.yml`,
`deploy/caddy/oil-top.ir.caddy`, and `.env.production.example` at the repo root.

Out of scope: local development (`README.md`) and CI (`.github/workflows/ci.yml`).

---

## 0. How this differs from a dedicated-box deploy

If you have deployed a Next.js app to a VPS before, three things here are
deliberately not what you would expect:

| Usual approach                                  | What this does instead                                                                       | Why                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Compose runs its own nginx on `80:80`/`443:443` | **No web server in this stack at all.** The app publishes `127.0.0.1:3001` only              | The VPS's existing web server already owns 80/443. A second binder either fails to start or takes the ports from the other sites |
| `docker compose up` in the project dir          | `--env-file .env.production` on every command, and `name: topoil` pinned in the compose file | Compose derives the project name from the directory; pinning it keeps containers and volumes namespaced away from the neighbours |
| `sudo ufw enable`                               | **Do not touch the firewall**                                                                | The other sites are reachable, so 80/443 are already open. Enabling ufw fresh on a live box drops every port you did not list    |
| `docker system prune -a` to clean up            | Never run it                                                                                 | It deletes images and networks belonging to the other projects too                                                               |

---

## 1. Survey the VPS before changing anything

SSH in and answer four questions. Do not skip this — every later step branches
on the answers.

```bash
sudo ss -tlnp | grep -E ':(80|443|3001)\s'
```

```bash
systemctl is-active caddy nginx; docker ps --format '{{.Names}}\t{{.Ports}}'
```

```bash
docker compose version
```

```bash
free -h; df -h /var/lib/docker; nproc
```

Those are, in order: what already listens on 80/443 and whether the port we
want is free; which web server owns those ports and whether it is a host
service or a container; and whether Docker and the Compose plugin are present.

As surveyed on 2026-08-20, this box runs **Caddy as a host process** owning
:80 and :443, with nginx installed but `inactive`, and two existing compose
stacks (`adliran24-*` and `tehran_erp_*`) whose published ports sit on
`127.0.0.1:5241-5244` and `:9000`. Port 3001 was free. §5 is written for that
arrangement — re-run the survey before trusting it, since the neighbours
change independently of this repo.

If port **3001** is taken, pick another free port and use it consistently in
`TOPOIL_PORT` (§3) and in the `reverse_proxy` line of the Caddy config (§5).

If `docker compose version` fails, install Docker from the official repo
(<https://docs.docker.com/engine/install/ubuntu/>) — but check first that the
other projects are not already running under a different runtime you would be
disturbing.

### The one way this deploy can hurt the neighbours

Everything else in this document is isolated by design, but `next build` is
memory-hungry — it routinely wants 2-4GB — and it runs on the same kernel as
the production containers. If it exhausts RAM, the Linux OOM killer does not
politely fail the build: it picks a victim by score and kills it, and a large
neighbouring container is a very plausible victim.

Read the `free -h` output before building. If **available** memory is under
about 3GB, do not build on this box. Build the image somewhere else and pull it
in instead:

```bash
docker build --target runner -t topoil-app:latest . && docker save topoil-app:latest | gzip > topoil-app.tar.gz
```

Copy that over, `docker load < topoil-app.tar.gz` on the VPS, and change the
`app` service from `build:` to `image: topoil-app:latest` before starting it.

If there is headroom but not a lot, at least confirm swap exists (`free -h`
shows a Swap row above zero) so a spike degrades into slowness rather than a
kill.

---

## 2. DNS

`oil-top.ir` is **not** on ArvanCloud DNS — its nameservers are
`ns1.hostiran.net` / `ns2.hostiran.net`, so records are edited in the HostIran
panel, not the Arvan panel or API.

**The A record is currently wrong and must be changed before deploying.** As of
the last check:

```
oil-top.ir.      A      95.38.232.127     <- not the VPS
www.oil-top.ir.  CNAME  oil-top.ir.       <- correct, leave alone
```

The VPS is **95.38.235.233**. The address the domain points at belongs to a
different /24 and answers nothing, so until this is fixed the site cannot come
up and Caddy cannot obtain a certificate — the ACME challenge is answered by
whichever machine the name resolves to.

In the HostIran DNS panel, change the `oil-top.ir` A record:

```
oil-top.ir.  A  95.38.235.233
```

Leave the `www` CNAME as it is — it follows the apex automatically.

The current TTL is 14400s (4h), so allow for that before expecting the change
to take. Confirm it has propagated before reloading Caddy in §5:

```bash
dig +short oil-top.ir
```

That must print `95.38.235.233`. Cross-check from the other side by running
`curl -s ifconfig.me` **on the VPS** — it should print the same address. If the
VPS reports a different public IP than the one you SSH to, it is behind NAT or
a CDN, and the A record needs to point at whatever fronts it rather than at the
VPS directly.

---

## 3. Clone and configure

Put it somewhere that does not collide with the existing projects:

```bash
sudo mkdir -p /srv/topoil && sudo chown "$USER":"$USER" /srv/topoil
```

```bash
git clone <your-repo-url> /srv/topoil
```

```bash
cd /srv/topoil && cp .env.production.example .env.production && chmod 600 .env.production
```

Fill it in. `.env.production.example` documents every variable; generate the
two secrets rather than inventing them:

```bash
openssl rand -base64 48
```

```bash
openssl rand -base64 24
```

The first is `JWT_SECRET`, the second `POSTGRES_PASSWORD` (which also has to be
copied into `DATABASE_URL`). Three values deserve particular attention:

- `DATABASE_URL`'s host is `postgres` — the compose service name on the
  internal network — not `localhost`, and not the port used in local dev.
- `NEXT_PUBLIC_SITE_URL=https://oil-top.ir`. This is baked into the bundle at
  build time (see the `ARG` in the Dockerfile), so changing it later means a
  rebuild, not just a restart.
- `TOPOIL_PORT` must match the port you confirmed free in §1 and the
  `reverse_proxy` port in the Caddy config.

---

## 3a. Build off-box, then load the image

Skip this section only if §1's `free -h` showed comfortable headroom. On the
current VPS it did not — 2.5GB available with 1.3GB of swap already in use —
so the image is built elsewhere and copied in. A `next build` on that box risks
the OOM killer choosing a production container as its victim.

Both images are built for `linux/amd64`, so build them on any amd64 machine
with Docker (a laptop is fine):

```bash
docker build --target runner --build-arg NEXT_PUBLIC_SITE_URL=https://oil-top.ir -t topoil-app:latest .
```

```bash
docker build --target migrator -t topoil-migrate:latest .
```

The `--build-arg` matters: `NEXT_PUBLIC_SITE_URL` is inlined at build time, so
the origin has to be correct _here_, not just in `.env.production`.

Bundle both into one file — they share base layers, so saving them together is
smaller than saving each alone (about 420MB gzipped):

```bash
docker save topoil-app:latest topoil-migrate:latest | gzip -6 > topoil-images.tar.gz
```

Copy it over and load it:

```bash
scp topoil-images.tar.gz ubuntu@95.38.235.233:/srv/topoil/
```

```bash
cd /srv/topoil && gunzip -c topoil-images.tar.gz | docker load && rm topoil-images.tar.gz
```

`docker load` only adds the two `topoil-*` tags. It cannot overwrite another
project's image unless that project happens to use the same tag, which nothing
on this box does.

Then start with `--no-build` in §4 so Compose uses what you just loaded instead
of trying to build. Repeat this section on every redeploy in place of the
`--build` in §7.

## 4. Build and start the app

`--env-file .env.production` is required on **every** compose command in this
doc. `env_file:` inside the compose file populates the containers, but the
`${TOPOIL_PORT}` and `${NEXT_PUBLIC_SITE_URL}` on the `app` service are
interpolated by Compose itself, before any container exists, and it reads those
from `--env-file`.

If you built off-box in §3a, use `--no-build` so Compose uses the loaded image:

```bash
cd /srv/topoil && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-build
```

Only if §1 showed enough memory to build in place, use `--build` instead:

```bash
cd /srv/topoil && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Either way this starts Postgres, waits for it to report healthy, runs `migrate`
(`prisma migrate deploy`, which exits when done), then starts `app`.

Verify — and confirm you have disturbed nothing:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/
```

```bash
sudo ss -tlnp | grep :3001
```

The curl should print `200` or `307`. The `ss` line must show
`127.0.0.1:3001`, **not** `0.0.0.0:3001` — a wildcard binding means the
loopback restriction was lost, and the app is on the public internet without
TLS. Stop and fix that before going further. Finally, `docker ps` should still
show the other projects' containers `Up`.

---

## 5. Wire it into the existing Caddy

This VPS serves :80 and :443 from **Caddy**, running as a host process. nginx is
installed but `inactive` — leave it that way. Starting it would fight Caddy for
the ports and take every site on the box down.

Caddy handles TLS itself, so there is no certbot step and nothing to bootstrap:
it requests a Let's Encrypt certificate the first time someone asks for a
hostname it is configured to serve. That is why §2's DNS change has to land
_before_ this step — the ACME challenge is answered by whichever machine the
name resolves to, so a stale A record means Caddy retries and fails.

### 5.1 Find how the Caddyfile is organised

```bash
sudo ls /etc/caddy/ && sudo grep -n import /etc/caddy/Caddyfile
```

- If there is an `import` line (e.g. `import /etc/caddy/sites/*`), drop the
  site file into that directory — the neighbouring sites each have their own
  file and this one joins them.
- If not, everything lives in one `Caddyfile` and the block gets appended to it.

### 5.2 Install the site block

Split-file layout — adjust the destination to match the `import` path:

```bash
sudo cp /srv/topoil/deploy/caddy/oil-top.ir.caddy /etc/caddy/sites/oil-top.ir.caddy
```

Single-file layout — append, and take a backup first, because this file is what
keeps the other sites online:

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F) && sudo tee -a /etc/caddy/Caddyfile < /srv/topoil/deploy/caddy/oil-top.ir.caddy
```

### 5.3 Validate, then reload (never restart)

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

```bash
sudo systemctl reload caddy
```

Validate first and only reload if it passes. `reload` swaps the config with no
dropped connections; `restart` briefly takes every site on the box offline. If
validation fails, restore the backup (or delete the file you added) and
re-validate — the running Caddy keeps serving the old config either way, as
long as you never reloaded a broken one.

Watch the certificate being issued:

```bash
sudo journalctl -u caddy -f
```

Look for `certificate obtained successfully` for `oil-top.ir`. Issuance usually
takes a few seconds after the first request. Repeated `no such host` or
challenge failures mean DNS has not propagated yet — go back to §2.

### 5.4 Confirm

```bash
curl -sSI https://oil-top.ir/ | head -5
```

```bash
curl -sSI https://www.oil-top.ir/ | head -5
```

The second should be a `301` to the bare domain. Then open one of the
neighbouring sites in a browser before calling this done.

---

## 6. Create the admin account

**Do not run `prisma db seed` on this database.** The seed wipes and re-creates
the entire catalog, and it hardcodes demo passwords (`Admin123!`,
`mostafa123`) — on a domain that now resolves publicly, that is an open door.
It is a local-development fixture only.

Use the bootstrap script instead. It touches exactly one `User` row, takes the
password from the environment, and refuses anything under 12 characters:

```bash
cd /srv/topoil && docker compose --env-file .env.production -f docker-compose.prod.yml run --rm -e ADMIN_EMAIL='you@example.com' -e ADMIN_PASSWORD='a-long-random-password' migrate pnpm tsx scripts/create-admin.ts
```

It runs in the `migrate` service because that image is the one carrying the
source tree and dev dependencies (`tsx`); the slim `app` runner has neither.
Re-running it with a new `ADMIN_PASSWORD` rotates the password rather than
failing on the duplicate email.

Then log in at `https://oil-top.ir/admin`.

Real catalog data is loaded separately with `scripts/import.ts` — see
`oil-city-import-notes.md`.

---

## 6a. Load the catalog

A fresh production database has schema and an admin account and nothing else.
The 3,469 products and 802 cars from the oil-city import live in whichever
database the import was run against — on a developer's machine, not here.

**The batch files do not travel with `git pull`.** `.gitignore` excludes
`/scrape/` entirely, because a few thousand scraped pages are reproducible data
rather than source. So a `git pull` on the VPS brings the importer and none of
what it eats.

Two ways across. Pick by which side you trust more.

### Option A — copy the batches, import on the VPS

Best when production should be built by the same code path that built local, and
when you want the import's report from the production run itself.

```bash
# from the machine that ran the scrape
rsync -avz --progress scrape/oil-city/ topoil@<VPS>:/srv/topoil/scrape/oil-city/

# on the VPS, inside the app container
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec app pnpm tsx scripts/import.ts --source oil-city --dry-run
```

Read the report, then drop `--dry-run`. It is idempotent: running it twice
reports every row unchanged, and it never writes to a row it did not create, so
an admin's hand-entered cars are safe.

Then apply the years, which is a separate pass for the same reason:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec app pnpm tsx scripts/enrich-years.ts --dry-run
```

Roughly 35 batch files, ~40 MB. The import takes a few minutes; the _scrape_
does not need to be repeated on the VPS and should not be.

### Option B — dump and restore

Faster, and it carries the review work with it: anything already activated,
priced or corrected locally arrives in that state.

```bash
# locally
docker compose exec db pg_dump -U topoil -d topoil --data-only --disable-triggers > catalog.sql
scp catalog.sql topoil@<VPS>:/tmp/

# on the VPS
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T db psql -U topoil -d topoil < /tmp/catalog.sql
```

**`--data-only` overwrites nothing by itself but collides with rows that already
exist.** Use this on a production database whose catalog is still empty. If
production already has hand-entered data, use Option A — the importer is built
to merge; a dump is not.

Delete `/tmp/catalog.sql` afterwards. It contains the whole catalog and has no
reason to persist.

### After either

Nothing is visible yet, by design: every imported row is INACTIVE, every
imported product has zero stock, and a product priced at zero cannot be
activated at all. Follow `docs/import-review-runbook.md` to decide what goes
live.

To light up one car brand and everything its cars need — models, types, the
recommended products, and those products' categories and brands:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec app pnpm tsx scripts/activate-imported.ts --car-brand "پژو" --dry-run
```

That script flips rows; it does not review them. `--deactivate` reverses it.

---

## 7. Redeploy

```bash
cd /srv/topoil && git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Compose rebuilds only what changed, reruns `migrate` to apply new Prisma
migrations, then recreates `app`. Caddy is untouched — it is not part of this
stack — so the other sites are unaffected by a redeploy.

This causes a few seconds of downtime while `app` is recreated (the old
container stops before the new one is serving). Zero-downtime rollout
(blue/green behind Caddy) is a worthwhile improvement, not implemented here.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app
```

---

## 8. Backups

The database lives in the `topoil_postgres_data` volume and uploaded images in
`topoil_uploads`. Both are backed up nightly by
`deploy/backup/topoil-backup.sh`: encrypted on this machine, copied to a second
machine, and checksum-verified there before anything old is deleted.

What one run produces, in `/var/backups/topoil` and again at the destination:

```
topoil-<STAMP>-db.sql.gz.gpg        pg_dump | gzip | gpg AES256
topoil-<STAMP>-uploads.tar.gz.gpg   tar of the uploads volume, same pipeline
topoil-<STAMP>.sha256               checksums of the two above
```

`<STAMP>` is UTC, `20260903T032015Z`. Measured on the real catalog (3,488
products, their fitment, 45 uploaded images): 5MB, 41MB, 13 seconds.

### 8.1 Install it (once)

```bash
sudo install -m 755 /srv/topoil/deploy/backup/topoil-backup.sh /usr/local/sbin/topoil-backup.sh
```

```bash
sudo mkdir -p /etc/topoil /var/backups/topoil /var/lib/topoil && sudo cp /srv/topoil/deploy/backup/backup.conf.example /etc/topoil/backup.conf && sudo chmod 600 /etc/topoil/backup.conf
```

Edit `/etc/topoil/backup.conf`. It is commented variable by variable; the one
that must be filled in is `BACKUP_REMOTE` — the script refuses to run without a
destination, because a copy that stays on this VPS is not a backup.

Then the encryption passphrase, in its own file:

```bash
sudo sh -c 'openssl rand -base64 48 > /etc/topoil/backup-passphrase' && sudo chmod 600 /etc/topoil/backup-passphrase
```

**Read the next paragraph before going further.** The passphrase now exists in
exactly one place: this VPS, the machine the backups protect you from losing. If
it dies with the box, every artifact ever produced becomes an unopenable file
and the backups were theatre. Copy it now into a password manager, or anywhere
that is not this machine and not the backup destination. Nobody will remind you
later — the script cannot tell whether you did this.

Nothing about the database password: `pg_dump` runs inside the container over
the postgres unix socket, which the image trusts, so no credential is passed, no
`PGPASSWORD` is set, and nothing to leak reaches a log or `ps`.

Finally the schedule:

```bash
sudo cp /srv/topoil/deploy/backup/topoil-backup.{service,timer} /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now topoil-backup.timer
```

03:20 local, `Persistent=true` so a night the box was off is caught at boot
rather than skipped. A systemd timer rather than cron because the run lands in
the journal with its exit code; if you would rather use cron, the equivalent is
`20 3 * * * /usr/local/sbin/topoil-backup.sh` in root's crontab and the script
behaves identically — it depends on nothing from an interactive shell.

Prove it before trusting it — the units have not been parsed by a systemd
anywhere yet, only written:

```bash
sudo systemd-analyze verify /etc/systemd/system/topoil-backup.timer
```

```bash
sudo systemctl start topoil-backup.service && journalctl -u topoil-backup.service -n 20 --no-pager
```

```bash
systemctl list-timers topoil-backup.timer --no-pager
```

### 8.2 Where the copies go, and what is kept

`BACKUP_REMOTE` in `/etc/topoil/backup.conf` is the single destination
variable. `REMOTE_MODE` picks the transport: `ssh` (scp/ssh to another machine,
key-only login — no rsync needed, since these artifacts are written once and
never modified), `rclone` (object storage), or `dir` (an already-mounted remote
filesystem). Each artifact is copied, then checksummed **at the destination**
and compared with the local sum. A transfer that cannot be verified fails the
run.

Retention is 7 daily, 4 weekly, 3 monthly — a week of day-by-day recovery, a
month of week-by-week, three months of month-by-month, about twelve sets and
roughly 0.6GB at current sizes. Pruning happens only after the new backup has
arrived off-box and matched its checksum, and it applies the same decision to
both ends.

One consequence worth knowing: while the destination is unreachable, nothing is
pruned, so local sets accumulate at ~46MB a night. That is the deliberate
trade — never delete an old backup on the strength of a new one that did not
arrive — and it is why 8.3 exists.

### 8.3 Check that it is still working

```bash
sudo /usr/local/sbin/topoil-backup.sh --check-status
```

Exits 0 if the last run succeeded within 26 hours, and 2 with the reason
otherwise. `/var/lib/topoil/backup-status` holds the same thing as key=value
lines. This is the hook OBS-002 monitors; until that lands, run it by hand after
any deploy and once a week.

A failed run is loud in three places at once: a non-zero exit, `ERROR` lines on
stderr and in `/var/backups/topoil/backup.log`, and a syslog entry tagged
`topoil-backup`. Nothing is pruned, no partial artifact is left behind, and the
previous good backups are untouched.

```bash
journalctl -u topoil-backup.service --since '2 days ago' --no-pager
```

### 8.4 Restoring

Deliberately not documented here yet: an untested restore procedure is a
guess. Rehearsing one against a scratch compose project and writing the runbook
is DR-002. Until that is done, treat these backups as unproven — they are
verified to decrypt and decompress on every run, which is not the same as
verified to bring the site back.

The one thing worth writing down before then: restore into a **fresh project
name**, never over the running stack. §9 explains why `name: topoil` is what
keeps this project's volumes reachable only by this project's commands.

---

## 9. Removing Top Oil without touching the neighbours

```bash
cd /srv/topoil && docker compose --env-file .env.production -f docker-compose.prod.yml down
```

```bash
sudo rm /etc/caddy/sites/oil-top.ir.caddy && sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

(If the block was appended to a single `Caddyfile`, delete those lines from it
or restore the `.bak` you took in §5.2 instead.)

`down` without `-v` keeps the database and uploads volumes. Add `-v` only when
you genuinely want the data gone — and note that `name: topoil` in the compose
file is what guarantees `-v` can only reach this project's volumes.

---

## 10. Future follow-up: storefront locale routing

A note for later, not a task today. Once the storefront ships EN/FA locale
routing in earnest, `sitemap.xml`/`robots.txt` will need to be locale-aware
(per-locale sitemaps, `hreflang` entries, locale-specific robots rules) rather
than a single global file. Flagging it now so it isn't forgotten; it isn't
needed for anything in this repo yet.
