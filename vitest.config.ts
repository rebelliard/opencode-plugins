import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["plugins/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["plugins/**/*.ts"],
      exclude: ["**/*.test.ts", "**/test-utils/**"],
      reporter: ["text", "lcov"],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
