# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base — shared OS deps: openssl (Prisma engines) + libc6-compat (native npm
# deps on musl), pnpm via corepack (version pinned by "packageManager" in
# package.json so every stage installs the exact same pnpm).
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — install with dev dependencies included, since the build stage needs
# typescript/prisma/tailwind etc. to run `prisma generate` and `next build`.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder — generate the Prisma client, then build the Next.js app.
# `output: "standalone"` (next.config.ts) makes `next build` trace the
# minimal server + dependency graph into .next/standalone.
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `NEXT_PUBLIC_*` is substituted into the bundle at build time, not read from
# the environment at runtime, so passing this only via `env_file:` would ship a
# sitemap and robots.txt full of http://localhost:3000 URLs. It has to be here,
# before `next build`. docker-compose.prod.yml forwards it as a build arg.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

RUN pnpm prisma generate
RUN pnpm build

# ---------------------------------------------------------------------------
# migrator — used by docker-compose.prod.yml as a one-off service that runs
# `prisma migrate deploy` against the database and exits, before the app
# service starts. Reuses the builder stage because `prisma migrate deploy`
# needs the Prisma CLI (a devDependency, not present in the slim runner
# below) plus prisma/schema.prisma and prisma/migrations.
# ---------------------------------------------------------------------------
FROM builder AS migrator
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# runner — final image: only the standalone server, static assets, and
# public files. No devDependencies, no Prisma CLI, no source tree.
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Mount point for uploaded product/brand/category images (see
# server/upload.ts) — mount a named volume here in docker-compose.prod.yml
# so uploads survive image rebuilds.
RUN mkdir -p ./public/uploads && chown nextjs:nodejs ./public/uploads

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
