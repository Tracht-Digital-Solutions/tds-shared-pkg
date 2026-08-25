import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // Default to node; component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock so the pure-logic suites
    // stay fast.
    environment: "node",

    // Undo `vi.stubGlobal` after every test. `vi.restoreAllMocks()` does NOT
    // do this — stubs and spies are separate mechanisms — and a leaked stub is
    // close to undebuggable: `vi.spyOn` on an already-mocked function returns
    // that same mock rather than wrapping it, so every later test in the file
    // silently shares one call history. api.test.ts stubbed `fetch` in one
    // describe and never unstubbed it; under vitest 2 that happened to be
    // harmless, and under vitest 4 it made two later tests in a DIFFERENT
    // describe count six calls they never made. They passed in isolation,
    // which is the tell.
    unstubGlobals: true,
  },
});
