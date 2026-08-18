# Deployment — shared Ubuntu VPS (oil-top.ir)

Top Oil runs as **one tenant among several** on an ArvanCloud VPS that is
already serving other sites. Everything below is written around that single
constraint: nothing in this stack may take a port, a config file, a firewall
rule, a container name or a volume that another project is already using.

The pieces: `Dockerfile`, `docker-compose.prod.yml`,
`deploy/nginx/oil-top.ir.conf`, and `.env.production.example` at the repo root.

Out of scope: local development (`README.md`) and CI (`.github/workflows/ci.yml`).

---

## 0. How this differs from a dedicated-box deploy

If you have deployed a Next.js app to a VPS before, three things here are
deliberately not what you would expect:

| Usual approach                                  | What this does instead                                                                       | Why                                                                                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Compose runs its own nginx on `80:80`/`443:443` | **No nginx service at all.** The app publishes `127.0.0.1:3001` only                         | The VPS's existing web server already owns 80/443. A second binder either fails to start or takes the ports from the other sites |
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
systemctl is-active nginx; docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Image}}'
```

```bash
docker compose version
```

```bash
sudo certbot certificates | grep -E 'Certificate Name|Domains'
```

Those are, in order: what already listens on 80/443 and whether the port we
want is free; whether the thing on 80/443 is a host nginx package or a
container; whether Docker and the Compose plugin are present; and which
certificates already exist, so we add one rather than replace one.

Record which case you are in:

- **Case A — host nginx** (`systemctl is-active nginx` says `active`): the
  server block goes in `/etc/nginx/conf.d/` or `/etc/nginx/sites-available/`.
  This is the common case and the rest of the doc assumes it.
- **Case B — nginx/Traefik/Caddy in a container** owning 80/443: the same
  server block content still applies, but it goes wherever that proxy reads
  its config from (a bind-mounted `conf.d` on the host, usually), and the
  `proxy_pass` target changes — see §5.1.

If port **3001** is taken, pick another free port and use it consistently in
`TOPOIL_PORT` (§3) and in the `proxy_pass` lines of the nginx config (§5).

If `docker compose version` fails, install Docker from the official repo
(<https://docs.docker.com/engine/install/ubuntu/>) — but check first that the
other projects are not already running under a different runtime you would be
disturbing.

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
up and certbot cannot issue a certificate — the ACME challenge is served by
whichever machine the name resolves to.

In the HostIran DNS panel, change the `oil-top.ir` A record:

```
oil-top.ir.  A  95.38.235.233
```

Leave the `www` CNAME as it is — it follows the apex automatically.

The current TTL is 14400s (4h), so allow for that before expecting the change
to take. Confirm it has propagated before running certbot:

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
  `proxy_pass` port in the nginx config.

---

## 4. Build and start the app

`--env-file .env.production` is required on **every** compose command in this
doc. `env_file:` inside the compose file populates the containers, but the
`${TOPOIL_PORT}` and `${NEXT_PUBLIC_SITE_URL}` on the `app` service are
interpolated by Compose itself, before any container exists, and it reads those
from `--env-file`.

```bash
cd /srv/topoil && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

This starts Postgres, waits for it to report healthy, runs `migrate`
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

## 5. Wire it into the existing nginx

### 5.1 Install the server block

**Case A — host nginx:**

```bash
sudo cp /srv/topoil/deploy/nginx/oil-top.ir.conf /etc/nginx/conf.d/oil-top.ir.conf
```

On a Debian/Ubuntu layout using `sites-available`, copy it there instead and
symlink it into `sites-enabled`.

**Case B — containerised proxy:** copy the same file into whatever host
directory that container bind-mounts as its `conf.d`, then change both
`proxy_pass http://127.0.0.1:3001;` lines — inside a container `127.0.0.1` is
the container itself, not the host. Either use `http://host.docker.internal:3001`
with `extra_hosts: ["host.docker.internal:host-gateway"]` on the proxy, or
attach the proxy to this stack's network and use `http://app:3000`.

The config is written to be a safe neighbour: `gzip` is set per-server rather
than globally, and the WebSocket upgrade map is named
`$topoil_connection_upgrade` — a duplicate `$connection_upgrade` would make
nginx refuse to start and take **every** site on the box down with it.

### 5.2 Certificate

The config references a certificate that does not exist yet, so nginx will fail
its config test until certbot has run. Get the cert first, using the webroot
the other sites already use if there is one:

```bash
sudo mkdir -p /var/www/certbot
```

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d oil-top.ir -d www.oil-top.ir --email you@example.com --agree-tos --non-interactive
```

If the existing nginx has no `/.well-known/acme-challenge/` location at the
server level, the webroot challenge will 404. In that case use the nginx
plugin, which writes a temporary block and cleans up after itself:

```bash
sudo certbot --nginx -d oil-top.ir -d www.oil-top.ir
```

Do **not** pass `--force-renewal`, and do not reuse a `--cert-name` that
belongs to an existing certificate — that is how you revoke a neighbour's TLS
by accident.

### 5.3 Test, then reload (never restart)

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

`nginx -t` must pass before you go anywhere near a reload. `reload` re-reads the
config without dropping connections; `restart` briefly takes every site on the
box offline. If `nginx -t` fails, remove the file you just added and re-test —
the other sites keep running on the old config as long as you never reloaded a
broken one.

Confirm from your own machine — the second should be a 301 to the bare domain:

```bash
curl -sSI https://oil-top.ir/ | head -5
```

```bash
curl -sSI https://www.oil-top.ir/ | head -5
```

Then load one of the other sites in a browser before you call this done.

### 5.4 Renewal

Certbot's systemd timer handles renewal, but host nginx needs a reload
afterwards to pick up the new certificate. If a deploy hook already exists from
another project, leave it alone — one reload serves every site. Otherwise
create `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` containing
`#!/bin/sh` and `systemctl reload nginx`, make it executable, and verify:

```bash
sudo certbot renew --dry-run
```

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

## 7. Redeploy

```bash
cd /srv/topoil && git pull && docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Compose rebuilds only what changed, reruns `migrate` to apply new Prisma
migrations, then recreates `app`. Nginx is untouched — it is not part of this
stack — so the other sites are unaffected by a redeploy.

This causes a few seconds of downtime while `app` is recreated (the old
container stops before the new one is serving). Zero-downtime rollout
(blue/green behind nginx) is a worthwhile improvement, not implemented here.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app
```

---

## 8. Backups

The database lives in the `topoil_postgres_data` volume and uploaded images in
`topoil_uploads`. Neither is backed up by anything yet — worth a cron job
before real data goes in.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres pg_dump -U topoil topoil | gzip > "topoil-$(date +%F).sql.gz"
```

```bash
docker run --rm -v topoil_uploads:/data -v "$PWD":/backup alpine tar czf "/backup/topoil-uploads-$(date +%F).tar.gz" -C /data .
```

---

## 9. Removing Top Oil without touching the neighbours

```bash
cd /srv/topoil && docker compose --env-file .env.production -f docker-compose.prod.yml down
```

```bash
sudo rm /etc/nginx/conf.d/oil-top.ir.conf && sudo nginx -t && sudo systemctl reload nginx
```

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
