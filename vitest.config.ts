import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Default to node; component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock so the pure-logic suites
    // stay fast.
    environment: "node",
  },
});
