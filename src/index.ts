/**
 * Default barrel — re-exports types only.
 *
 * For Zod schemas, i18n, motion, React components, or the design-system
 * stylesheets, use the subpath imports (`/schemas`, `/i18n`,
 * `/i18n/react`, `/motion`, `/components`, `/styles/base.css`,
 * `/styles/app.css`). This keeps the default import lean and allows
 * tree-shakers to drop the heavier modules when only types are needed.
 */

export type * from "./types";
