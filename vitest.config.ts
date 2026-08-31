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
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },
  },
});
