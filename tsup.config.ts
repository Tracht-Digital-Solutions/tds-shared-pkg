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
    "astro/index": "src/astro/index.ts",
    "design/index": "src/design/index.ts",
    "toast/index": "src/toast/index.ts",
    "api/index": "src/api/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react", "react-dom", "zod"],
});
