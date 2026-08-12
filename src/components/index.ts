/**
 * Shared React UI components used across the TDS frontends. Import from
 * `@tracht-digital-solutions/tds-shared/components`.
 */

export { default as ThemeToggle } from "./ThemeToggle";
export type { ThemeToggleProps } from "./ThemeToggle";

export { default as FormAlert } from "./FormAlert";
export type { FormAlertProps } from "./FormAlert";

export { default as ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";

export { default as CookieNotice } from "./CookieNotice";
export type { CookieNoticeProps } from "./CookieNotice";

export { default as LiveChatCta } from "./LiveChatCta";
export type { LiveChatCtaProps } from "./LiveChatCta";
export {
  getAdConsent,
  setAdConsent,
  AD_CONSENT_KEY,
  AD_CONSENT_EVENT,
  type AdConsent,
} from "./CookieNotice";

export { default as ToastHost } from "./ToastHost";
export type { ToastHostProps } from "./ToastHost";
/* The bus is re-exported here so a React island needs ONE import path; a
   plain-TS module (e.g. the host's dashboardLayout.ts) imports
   `@tracht-digital-solutions/tds-shared/toast` instead and stays React-free. */
export {
  showToast,
  toast,
  TOAST_EVENT,
  TOAST_DURATIONS,
  TOAST_MAX_VISIBLE,
  type ToastDetail,
  type ToastVariant,
} from "../toast";

/* Same reasoning as the toast bus: an island gets the panel API transport from
   the one import path it already uses, while a plain-TS module imports
   `@tracht-digital-solutions/tds-shared/api` and stays React-free. */
export {
  apiBase,
  apiFetch,
  apiUrl,
  resetApiBase,
  setUnauthorizedHandler,
  API_BASE_META,
  DEFAULT_API_BASE,
} from "../api";

export { default as Spinner } from "./Spinner";
export type { SpinnerProps } from "./Spinner";

export { default as Skeleton } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";

export { default as SkeletonText } from "./SkeletonText";
export type { SkeletonTextProps } from "./SkeletonText";
