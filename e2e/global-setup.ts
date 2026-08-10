import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { request } from "@playwright/test";

const ADMIN_EMAIL = "admin@topoil.com";
const ADMIN_PASSWORD = "Admin123!";

export default async function globalSetup() {
  execSync("pnpm exec tsx scripts/e2e-reset-db.ts", {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  const baseURL = `http://localhost:${process.env.E2E_PORT ?? "3100"}`;
  const context = await request.newContext({ baseURL });

  // `webServer` readiness only guarantees the port accepts connections, not
  // that this specific route is compiled/reachable yet — retry rather than
  // assume the very first request succeeds.
  const deadline = Date.now() + 60_000;
  let result: { success: boolean; error?: string } | undefined;
  for (;;) {
    try {
      const response = await context.post("/api/auth/login", {
        // `identifier`, not `email`: the route takes a phone-or-email
        // credential now that the storefront shares it (Task 7.1).
        data: { identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      result = await response.json();
      if (result?.success) break;
      // A rejected *body* will never start succeeding, and retrying it once a
      // second only burns the route's rate limit until the real error is
      // replaced by a 429. Anything else (route not compiled yet, connection
      // refused) is still worth waiting out.
      if (response.status() === 400) break;
    } catch {
      // server not ready yet
    }
    if (Date.now() > deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!result?.success) {
    throw new Error(`E2E global setup: admin login failed — ${result?.error}`);
  }

  // next dev compiles each *route pattern* on its first hit, regardless of
  // which dynamic id triggers it — including, occasionally, briefly serving
  // a 404 for the very first request to a brand-new nested dynamic route
  // while the on-demand entry registers. Hitting every dynamic route once
  // here (dummy ids are fine — this only needs to compile the page module)
  // means the real tests never race that first-hit compile/404 window.
  const dynamicRouteWarmups = [
    "/admin/categories/warmup",
    "/admin/brands/warmup",
    "/admin/products/warmup",
    "/admin/cars/brands/warmup",
    "/admin/cars/brands/warmup/models",
    "/admin/cars/brands/warmup/models/warmup",
    "/admin/cars/brands/warmup/models/warmup/engines",
    "/admin/cars/brands/warmup/models/warmup/engines/warmup",
    "/admin/cars/fitment-profiles/warmup",
    "/admin/cars/preview",
    "/admin/inventory",
    "/admin/orders/warmup",
    "/admin/inquiries/warmup",
    // The storefront tree (Phase 11's specs). Same first-hit compile as above,
    // and the account routes are deliberately absent: `proxy.ts` redirects this
    // admin context away from them, so requesting them here would warm the
    // login form rather than the page.
    "/en",
    "/fa",
    "/en/products",
    "/en/products/warmup",
    "/en/categories/warmup",
    "/en/fitment",
    "/en/cars/warmup",
    "/en/cars/warmup/warmup",
    "/en/cart",
    "/en/checkout",
    "/en/checkout/confirmation",
    "/en/login",
  ];
  for (const routePath of dynamicRouteWarmups) {
    await context.get(routePath).catch(() => {});
  }

  const authDir = path.resolve(__dirname, ".auth");
  fs.mkdirSync(authDir, { recursive: true });
  await context.storageState({ path: path.join(authDir, "admin.json") });
  await context.dispose();
}
