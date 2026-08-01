import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Mirrors the "@/*" path alias from tsconfig.json, which Next.js resolves
// natively but Vitest does not without this.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // e2e/*.spec.ts are Playwright tests (run via `pnpm test:e2e`), not
    // Vitest — without this, Vitest's default glob also matches *.spec.ts
    // and tries to run them, which fails since they use Playwright's test().
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
