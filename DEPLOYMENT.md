# Deployment — Ubuntu VPS

Production deployment of the Top Oil admin panel via Docker Compose + Nginx +
Let's Encrypt, on a plain Ubuntu VPS. See `Dockerfile`, `docker-compose.prod.yml`,
and `nginx.conf` at the repo root — this doc explains how they fit together and
the exact commands to run them.

Out of scope here: local development (see `README.md`) and CI (see
`.github/workflows/ci.yml`).

---

## 1. Initial VPS setup

Run as a user with `sudo`, on a fresh Ubuntu 22.04/24.04 VPS.

### 1.1 Create a non-root deploy user

```bash
adduser deploy
usermod -aG sudo deploy
# switch to it for the rest of this doc
su - deploy
```

### 1.2 Install Docker + the Compose plugin

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# let `deploy` run docker without sudo
sudo usermod -aG docker deploy
# log out and back in for the group change to take effect
```

Verify: `docker compose version`.

### 1.3 Firewall — only SSH, HTTP, HTTPS

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Postgres is never exposed — `docker-compose.prod.yml` gives it no `ports:`
mapping, so it's only reachable from the `app`/`migrate` containers on the
compose network, not from the host or the internet.

### 1.4 Install certbot (host-level, not containerized)

```bash
sudo apt-get install -y certbot
```

---

## 2. Clone the repo and configure

```bash
git clone <your-repo-url> topoil
cd topoil
```

Create `.env.production` (never commit this file — it holds real secrets):

```bash
DATABASE_URL="postgresql://USER:PASSWORD@postgres:5432/topoil?schema=public"
POSTGRES_USER=USER
POSTGRES_PASSWORD=PASSWORD
POSTGRES_DB=topoil

JWT_SECRET=<generate a long random string, e.g. `openssl rand -base64 48`>
NODE_ENV=production
COOKIE_NAME=topoil_session
```

Note `DATABASE_URL`'s host is `postgres` (the compose service name), not
`localhost` — the `app` and `migrate` containers reach Postgres over the
compose network, not the VPS's own network stack.

Edit `nginx.conf` and replace every `admin.yourdomain.com` with the real
hostname you're pointing at this VPS.

---

## 3. First boot — bootstrap the TLS certificate

`nginx.conf` ships with an HTTPS server block that points at a certificate
that doesn't exist yet, and certbot's webroot method needs nginx already
serving plain HTTP to complete the ACME challenge. Break that cycle once,
the first time only:

```bash
# 1. Comment out the whole `server { listen 443 ssl; ... }` block in
#    nginx.conf, leaving only the HTTP (port 80) block active.

# 2. Bring up nginx (it only needs the HTTP block to serve the challenge —
#    the app doesn't need to be running yet).
sudo mkdir -p /var/www/certbot
docker compose -f docker-compose.prod.yml up -d nginx

# 3. Obtain the certificate.
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d admin.yourdomain.com \
  --email you@example.com \
  --agree-tos --non-interactive

# 4. Uncomment the HTTPS server block in nginx.conf again, then reload it.
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Auto-renewal

Certbot's package installs a systemd timer that renews certs nearing
expiry, but nginx still needs reloading afterwards to pick up the renewed
cert. Add a deploy hook:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null <<'EOF'
#!/bin/sh
docker compose -f /home/deploy/topoil/docker-compose.prod.yml exec nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

`sudo certbot renew --dry-run` to confirm it's wired up correctly.

---

## 4. Start the app

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the `app` image (Next.js standalone server) and the `migrate`
image (Prisma CLI + migrations), starts Postgres, waits for it to report
healthy, runs `migrate` to apply any pending Prisma migrations (it exits
once done), then starts `app` and `nginx`. See `docker-compose.prod.yml`
for why migrations run as a separate one-off service rather than inside
the `app` container's own startup.

Check everything is up: `docker compose -f docker-compose.prod.yml ps`.

---

## 5. Update / redeploy

```bash
cd topoil
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Compose rebuilds only the images whose source changed, reruns `migrate`
(applying any new migrations before `app` restarts), then recreates `app`
and `nginx` as needed.

**Note:** this causes a brief moment of downtime while the `app` container
is recreated (the old one stops before the new one is healthy and serving).
A zero-downtime rollout (blue/green containers behind nginx, or a
orchestrator with rolling updates) is a worthwhile future improvement, not
implemented here.

---

## 6. Future follow-up: storefront locale routing

Nothing to do for the admin panel today — this is a note for whenever the
customer-facing storefront is built. Once it ships with EN/FA locale
routing, `sitemap.xml`/`robots.txt` will need to be locale-aware (per-locale
sitemaps, `hreflang` entries, locale-specific robots rules) rather than a
single global file. Flagging it now so it isn't forgotten; it isn't needed
for anything in this repo yet.
