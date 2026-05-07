/**
 * Default barrel — re-exports types only.
 *
 * For Zod schemas, i18n, motion, or brand tokens, use the subpath
 * imports (`/schemas`, `/i18n`, `/i18n/react`, `/motion`, `/brand`,
 * `/brand/tailwind-preset`). This keeps the default import lean and
 * allows tree-shakers to drop the heavier modules when only types are
 * needed.
 */

export type * from "./types";
