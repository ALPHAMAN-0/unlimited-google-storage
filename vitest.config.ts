import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      // We measure coverage on the *pure-logic* files we can unit-test in
      // isolation. The storage engine, auth glue, and API routes need a
      // real Postgres + Google OAuth sandbox and are covered by Playwright
      // e2e tests (see tests/e2e/).
      include: [
        "src/lib/crypto.ts",
        "src/lib/format.ts",
        "src/lib/validate.ts",
        "src/lib/rate-limit.ts",
        "src/lib/utils.ts",
        "src/server/storage/picker.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
