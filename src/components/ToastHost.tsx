import { useCallback, useEffect, useRef, useState } from "react";
import { translations, type Language } from "../i18n/translations";
import { resolveToastVariant } from "../design";
import {
  TOAST_DURATIONS,
  TOAST_EVENT,
  TOAST_MAX_VISIBLE,
  type ToastDetail,
  type ToastVariant,
} from "../toast";

export interface ToastHostProps {
  /** UI language for the dismiss control's accessible name. Defaults to German. */
  lang?: Language;
}

interface ToastItem extends ToastDetail {
  /** Stable React key — the dedup key plus a mount counter. */
  id: number;
  dedupe: string;
  /** How often this exact message arrived while it was on screen. */
  count: number;
  duration: number;
}

/** Per-toast dismissal timer; `handle === null` means "paused or not started". */
interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remaining: number;
  count: number;
}

interface ToastWindow extends Window {
  __tdsToastReady?: boolean;
  __tdsToastQueue?: ToastDetail[];
  __tdsToastHostMounted?: boolean;
}

const ICONS: Readonly<Record<ToastVariant, string>> = {
  // Check, exclamation-in-circle, exclamation-in-triangle-ish, and info — all
  // 20×20 currentColor paths, hand-inlined like FormAlert's. No icon library
  // enters the design library.
  success: "M16.7 5.8a.9.9 0 010 1.3l-7.2 7.2a.9.9 0 01-1.3 0L4.3 10.4a.9.9 0 111.3-1.3l3.2 3.2 6.6-6.5a.9.9 0 011.3 0z",
  danger:
    "M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a.9.9 0 01.9.9v4.4a.9.9 0 01-1.8 0V6.9A.9.9 0 0110 6zm0 8.4a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2z",
  warning:
    "M9.1 3.1a1 1 0 011.8 0l7 12.4a1 1 0 01-.9 1.5H3a1 1 0 01-.9-1.5l7-12.4zM10 7a.9.9 0 00-.9.9v3.4a.9.9 0 001.8 0V7.9A.9.9 0 0010 7zm0 7.6a1.05 1.05 0 100-2.1 1.05 1.05 0 000 2.1z",
  info: "M10 2a8 8 0 100 16 8 8 0 000-16zm0 3.4a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2zm0 3.7a.9.9 0 01.9.9v4a.9.9 0 01-1.8 0v-4a.9.9 0 01.9-.9z",
};

/** danger is announced assertively; everything else waits its turn. */
const isUrgent = (variant: ToastVariant) => variant === "danger";

let nextId = 1;

/**
 * Global toast stack — the visible half of the toast system (bus: `../toast`).
 *
 * Mount ONCE per app, next to `CookieNotice` in the shell layout. It listens
 * for the `tds:toast` window event, so any island, any plain module and even a
 * console call can raise a toast without a shared React tree (Astro gives us up
 * to 17 separate roots per page — there is no provider to hang this on).
 *
 * ### Two live regions, always in the DOM
 *
 * The host NEVER returns `null`, even with nothing to show. An `aria-live`
 * region that is inserted together with its first message is not announced by
 * NVDA/JAWS/VoiceOver — the region has to exist before the text arrives. So
 * both regions render empty from first paint. Do not "optimise" that away.
 *
 * Failures live in the `role="alert"` (assertive) region and everything else in
 * `role="status"` (polite), which also means a red toast can never be evicted
 * by a run of successes: the cap is per region.
 *
 * Focus is never touched — a toast is not a dialog. Timers pause on hover and
 * on focus-within, which is what keeps auto-dismissal WCAG 2.2.1-compatible.
 * Styling is the `.tds-toast*` block in `styles/base.css` (base, not app.css,
 * so the public sites can adopt it without new CSS).
 */
export default function ToastHost({ lang = "de" }: ToastHostProps = {}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [paused, setPaused] = useState(false);
  // A second host would double every toast. First one wins; the other stays
  // inert (and says so once) rather than silently duplicating the UI.
  const [duplicate, setDuplicate] = useState(false);
  const timers = useRef(new Map<number, Timer>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer?.handle !== undefined && timer.handle !== null) clearTimeout(timer.handle);
    timers.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((detail: ToastDetail) => {
    // Normalise HERE, not only in showToast: the event is the public contract
    // and anything can dispatch it (an older extension, a console call), so
    // the renderer is the last line of defence against a colourless signal.
    const variant = resolveToastVariant(detail.variant);
    const message = String(detail.message ?? "");
    if (message === "") return;
    const dedupe = detail.key ?? `${variant}:${message}`;
    const duration = detail.duration ?? TOAST_DURATIONS[variant] ?? TOAST_DURATIONS.info;

    setItems((prev) => {
      const existing = prev.find((item) => item.dedupe === dedupe);
      if (existing) {
        // Same message again: count it instead of stacking a second copy, and
        // let the effect below restart its timer (`count` is in the deps).
        return prev.map((item) =>
          item.id === existing.id ? { ...item, count: item.count + 1, message } : item,
        );
      }
      const item: ToastItem = { variant, message, dedupe, duration, id: nextId++, count: 1 };
      const sameRegion = prev.filter((other) => isUrgent(other.variant) === isUrgent(variant));
      if (sameRegion.length >= TOAST_MAX_VISIBLE) {
        const oldest = sameRegion[0];
        return [...prev.filter((other) => other.id !== oldest?.id), item];
      }
      return [...prev, item];
    });
  }, []);

  useEffect(() => {
    const w = window as ToastWindow;
    if (w.__tdsToastHostMounted) {
      setDuplicate(true);
      // eslint-disable-next-line no-console
      console.warn("[tds] A second ToastHost was mounted — only the first renders toasts.");
      return;
    }
    w.__tdsToastHostMounted = true;

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (detail && typeof detail.message === "string") push(detail);
    };
    window.addEventListener(TOAST_EVENT, onToast);

    // Drain whatever was raised before this island hydrated (it is
    // `client:idle`, so an inline script can easily beat it).
    w.__tdsToastReady = true;
    const queued = w.__tdsToastQueue ?? [];
    w.__tdsToastQueue = [];
    for (const detail of queued) push(detail);

    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      w.__tdsToastReady = false;
      w.__tdsToastHostMounted = false;
    };
  }, [push]);

  // One timer per toast, tracked in a ref so that adding a fourth toast does
  // NOT restart the other three. Pausing banks the remaining time rather than
  // dropping it, so a hovered stack resumes where it left off instead of
  // granting every toast a fresh full duration.
  useEffect(() => {
    const handles = timers.current;

    for (const item of items) {
      if (item.duration <= 0) continue; // 0 = until dismissed
      const existing = handles.get(item.id);
      // A repeat of the same message (count bumped) earns the full time again.
      if (!existing || existing.count !== item.count) {
        if (existing?.handle !== undefined && existing?.handle !== null) clearTimeout(existing.handle);
        handles.set(item.id, { handle: null, startedAt: 0, remaining: item.duration, count: item.count });
      }
    }
    for (const [id, timer] of [...handles]) {
      if (items.some((item) => item.id === id)) continue;
      if (timer.handle !== null) clearTimeout(timer.handle);
      handles.delete(id);
    }

    for (const [id, timer] of handles) {
      if (paused) {
        if (timer.handle === null) continue;
        clearTimeout(timer.handle);
        timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
        timer.handle = null;
      } else if (timer.handle === null) {
        timer.startedAt = Date.now();
        timer.handle = setTimeout(() => {
          handles.delete(id);
          setItems((prev) => prev.filter((other) => other.id !== id));
        }, timer.remaining);
      }
    }
  }, [items, paused]);

  // Clear on unmount only — the effect above deliberately keeps its handles
  // across re-renders.
  useEffect(() => {
    const handles = timers.current;
    return () => {
      for (const timer of handles.values()) if (timer.handle !== null) clearTimeout(timer.handle);
      handles.clear();
    };
  }, []);

  if (duplicate) return null;

  const t = translations[lang].toast;
  const urgent = items.filter((item) => isUrgent(item.variant));
  const polite = items.filter((item) => !isUrgent(item.variant));

  const renderToast = (item: ToastItem) => (
    <div key={item.id} className={`tds-toast tds-toast--${item.variant}`}>
      <svg className="tds-toast__icon" aria-hidden="true" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" clipRule="evenodd" d={ICONS[item.variant]} />
      </svg>
      <span className="tds-toast__message">
        {item.message}
        {item.count > 1 ? <span className="tds-toast__count">×{item.count}</span> : null}
      </span>
      <button
        type="button"
        className="tds-toast__dismiss"
        aria-label={t.dismiss}
        title={t.dismiss}
        onClick={() => dismiss(item.id)}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );

  return (
    <div
      className="tds-toast-host"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="tds-toast-region" role="alert" aria-live="assertive" aria-relevant="additions">
        {urgent.map(renderToast)}
      </div>
      <div className="tds-toast-region" role="status" aria-live="polite" aria-relevant="additions">
        {polite.map(renderToast)}
      </div>
    </div>
  );
}
