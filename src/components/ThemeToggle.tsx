import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { THEME_ATTRIBUTE, type Theme } from "../design/index.js";
import { onThemeChange } from "../theme/index.js";
import { attachThemeToggle, MOON_PATH, SUN_RAYS } from "../theme/toggle.js";

export interface ThemeToggleProps {
  /** aria-label / title shown in light mode (tap to go dark). */
  labelToDark?: string;
  /** aria-label / title shown in dark mode (tap to go light). */
  labelToLight?: string;
}

/**
 * Theme toggle — flips `<html data-theme="light|dark">` and persists the
 * choice in localStorage under `tds-theme`. Initial state on mount is
 * read from the document (set synchronously by the no-flash script in
 * each app's Layout <head>) so the button doesn't flash to a default and
 * then correct itself.
 *
 * The behaviour — the flip, its View Transition and the hover preview — is
 * `attachThemeToggle` in `../theme/toggle`, shared with the plain-DOM toggle
 * the public sites render without React (`./dom`). This component only owns
 * the icon and label state.
 *
 * Icons show the *target* state — moon in light mode (tap to go dark),
 * sun in dark mode (tap to go light), matching the Material/iOS
 * convention.
 */
export default function ThemeToggle({
  labelToDark = "Auf Dunkel umschalten",
  labelToLight = "Auf Hell umschalten",
}: ThemeToggleProps = {}) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  // Set by the first click, so the icon turns when the visitor flips the
  // theme and never on hydration.
  const [flipped, setFlipped] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    setTheme(current === "dark" ? "dark" : "light");
    setMounted(true);
    // Follow the theme when somebody ELSE changes it too — the profile page,
    // `startSystemThemeSync` following the OS, the panel host restoring a
    // per-user choice. `applyThemePreference` is the single write path and
    // announces itself, so this is one subscription.
    return onThemeChange((detail) => setTheme(detail.theme));
  }, []);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    // flushSync so React commits the icon swap before the View Transition
    // takes its snapshot.
    return attachThemeToggle(button, {
      commit: (apply) =>
        flushSync(() => {
          setFlipped(true);
          apply();
        }),
    });
  }, []);

  // Render a stable label/icon during SSR + initial paint so the
  // server-rendered button matches the first client paint. Once
  // mounted, the real state takes over.
  const dark = mounted && theme === "dark";
  const label = dark ? labelToLight : labelToDark;
  const turn = flipped ? " tds-theme-toggle__icon--turn" : "";

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      // `tds-theme-toggle` carries nothing but the coarse-pointer hit area
      // (base.css). The utilities below are 36px, which is under the touch
      // minimum — and this button is one of the three controls the panel's
      // mobile top bar shows at all times.
      className="tds-theme-toggle inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--color-muted)] hover:text-[var(--color-primary)] hover:bg-black/5 active:bg-black/10 transition-colors cursor-pointer"
    >
      {/* Moon — visible in light mode (tap to enter dark). */}
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${dark ? "hidden" : "block"}${turn}`}
      >
        <path d={MOON_PATH} />
      </svg>
      {/* Sun — visible in dark mode (tap to leave dark). */}
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${dark ? "block" : "hidden"}${turn}`}
      >
        <circle cx="12" cy="12" r="4" />
        {SUN_RAYS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </svg>
    </button>
  );
}

