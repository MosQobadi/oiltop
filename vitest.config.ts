import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the "@/*" path alias from tsconfig.json, which Next.js resolves
// natively but Vitest does not without this.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
