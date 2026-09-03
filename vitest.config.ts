import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    forks: { singleFork: true },
    // Vitest's default exclude list doesn't cover .claude/ — a stray Agent
    // worktree left there gets picked up as a second, duplicate copy of the
    // whole test suite (double-counted files, confusing failures).
    // tests/e2e/**/*.spec.ts matches vitest's own default include glob
    // (**/*.{test,spec}.*) but is written for @playwright/test, runs live
    // against production, and needs `npx playwright test` — without this
    // exclude, a plain `npm test` would try to execute it under vitest
    // (wrong test runner, real network calls against prod) alongside the
    // real unit suite.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**", "**/tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },
  },
});
