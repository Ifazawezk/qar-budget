import { defineConfig } from "vitest/config";

export default defineConfig({
  // Served from https://<user>.github.io/qar-budget/ on GitHub Pages.
  base: "/qar-budget/",
  test: {
    include: ["src/**/*.test.ts"],
  },
});
