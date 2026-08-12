/**
 * Toast bus — the transport half of the toast system.
 *
 * Consumed via
 * `import { toast } from "@tracht-digital-solutions/tds-shared/toast"`.
 *
 * ### Why a window event and not a React context
 *
 * Astro mounts every `client:*` island as its own React root — the panel
 * dashboard alone has up to 17 on one page, deliberately (`client:visible`
 * per widget). There is no common tree to hang a provider on, and the loudest
 * caller isn't React at all: `dashboardLayout.ts` in the frontend host is a
 * plain module loaded from an Astro `<script>`. So the bus is a `window`
 * `CustomEvent`, exactly like `tds:lang-change` (i18n/react) and
 * `tds-ad-consent` (components/CookieNotice), and this module stays free of
 * React so importing it never pulls the runtime into a plain-TS chunk.
 *
 * ### Why it can never throw
 *
 * A toast reports on an action; it must not be able to break it. Every step
 * is guarded, `showToast` returns `void`, and on a server render it is a
 * no-op. A caller can put it in a `.catch()` without a second thought.
 */
import { resolveToastVariant, type ToastVariant } from "../design";

export type { ToastVariant };

/**
 * The window event carrying a toast. Namespaced `tds:` per the newer
 * convention (`tds:lang-change`); `tds-ad-consent` predates it.
 *
 * This name is a contract with {@link ToastHost} and with any test that
 * asserts a toast was raised — import it, don't retype it.
 */
export const TOAST_EVENT = "tds:toast";

export interface ToastDetail {
  /** Signal colour + screen-reader politeness. Unknown values render as info. */
  variant: ToastVariant;
  /** Plain text. Rendered as a text node — never as HTML. */
  message: string;
  /** Visible time in ms. Omitted ⇒ {@link TOAST_DURATIONS}; 0 ⇒ until dismissed. */
  duration?: number;
  /**
   * Dedup key. Two toasts with the same key (default: variant + message)
   * collapse into one with a counter instead of stacking duplicates.
   */
  key?: string;
  /**
   * Optional target the message links to. Set it when the toast announces
   * something that lives somewhere else — a new contact request the reader will
   * want to open. The host renders the message as an `<a>`; without it the
   * message stays a text node.
   *
   * Same-document paths only (`/kontakt?id=42`). A toast is raised by our own
   * code, but it is dispatched over a public window event, so the host
   * additionally refuses anything that isn't a path (see ToastHost).
   */
  href?: string;
}

/**
 * Per-variant visible time.
 *
 * Failures get more than double a success: the reader has to take in a status
 * code and decide what to do, where "Gespeichert." only needs to be glimpsed.
 * Nothing is sticky — the host also pauses the timer on hover/focus, which is
 * what keeps auto-dismissal WCAG 2.2.1-compatible.
 */
export const TOAST_DURATIONS: Readonly<Record<ToastVariant, number>> = {
  success: 4000,
  info: 5000,
  warning: 8000,
  danger: 10000,
};

/** Visible toasts per live region before the oldest is evicted. */
export const TOAST_MAX_VISIBLE = 3;

/** Window fields the bus uses to survive the pre-hydration window. */
interface ToastWindow extends Window {
  __tdsToastReady?: boolean;
  __tdsToastQueue?: ToastDetail[];
}

/**
 * Raise a toast.
 *
 * Always dispatches — the event is the observable contract, which is what
 * lets a test assert a toast with a plain `addEventListener` and no host
 * mounted. Additionally buffers while no host has mounted yet: the host is
 * `client:idle`, so a toast raised by an inline script during page load would
 * otherwise be dispatched into an empty room. The host drains the buffer once
 * on mount, so a buffered toast is shown exactly once.
 */
export function showToast(detail: ToastDetail): void {
  if (typeof window === "undefined") return; // SSR / build-time no-op
  const w = window as ToastWindow;
  const normalised: ToastDetail = { ...detail, variant: resolveToastVariant(detail.variant) };
  try {
    w.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: normalised }));
  } catch {
    /* a toast must never break the action it reports on */
  }
  try {
    if (!w.__tdsToastReady) {
      (w.__tdsToastQueue ??= []).push(normalised);
    }
  } catch {
    /* ignore */
  }
}

type ToastOptions = Omit<ToastDetail, "variant" | "message">;

const raise = (variant: ToastVariant) => (message: string, opts: ToastOptions = {}) =>
  showToast({ ...opts, variant, message });

/**
 * The call-site sugar. One line at the ~40 places that report an outcome:
 *
 * ```ts
 * toast.success("Gespeichert.");
 * toast.danger(`Speichern fehlgeschlagen (HTTP ${res.status}).`);
 * ```
 *
 * Delegates to {@link showToast} — one implementation, one event shape.
 */
export const toast = {
  success: raise("success"),
  warning: raise("warning"),
  danger: raise("danger"),
  info: raise("info"),
} as const;
