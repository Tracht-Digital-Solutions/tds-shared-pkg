import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "schemas/index": "src/schemas/index.ts",
    "permissions/index": "src/permissions/index.ts",
    "i18n/index": "src/i18n/index.ts",
    "i18n/react": "src/i18n/react.tsx",
    "motion/index": "src/motion/index.ts",
    "components/index": "src/components/index.ts",
    // The consent manager. Its own entry rather than a re-export from
    // `components`: a non-React consumer (an inline script deciding whether to
    // inject a tag) imports `/consent` for `consentGranted` and must not drag
    // the whole component barrel — and React — in behind it.
    "consent/index": "src/consent/index.ts",
    "astro/index": "src/astro/index.ts",
    "design/index": "src/design/index.ts",
    "theme/index": "src/theme/index.ts",
    "toast/index": "src/toast/index.ts",
    "nav/index": "src/nav/index.ts",
    "api/index": "src/api/index.ts",
    // The browser-side stale-while-revalidate data cache. Its own entry rather
    // than a re-export from `index`, so a non-React consumer never drags React
    // into its bundle.
    "data/index": "src/data/index.ts",
    "install/index": "src/install/index.ts",
    "markdown/index": "src/markdown/index.ts",
    // Server-only: imports node:fs/node:crypto. Its own entry point on
    // purpose — never re-exported from `index`, which every browser bundle in
    // the workspace pulls in.
    "cache/index": "src/cache/index.ts",
    // Server-only: private credentials and the filesystem-backed pairing
    // state. Never re-export from the browser-safe root entry.
    "connection/index": "src/connection/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "zod"],
});
