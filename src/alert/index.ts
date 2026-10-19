/**
 * `<Alert>` on its own entry, so a tool island imports exactly this and not
 * the component barrel (same split as `./dropzone`).
 */
export { default as Alert } from "../components/Alert";
export type { AlertProps, AlertTone } from "../components/Alert";
