import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY, type Theme } from "../design/index.js";
import { cssEase } from "../motion/index.js";

// Shared with the no-flash <head> bootstrap (tds-shared/astro
// `themeBootstrapScript`), which READS this key before paint while this
// component WRITES it. Don't re-inline the literal — they must move together.
const STORAGE_KEY = THEME_STORAGE_KEY;

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
 * When the View Transitions API is available (and the user hasn't asked
 * for reduced motion) the incoming theme wipes in as a circle growing
 * from the centre of the button; the supporting CSS ships in
 * `@tracht-digital-solutions/tds-shared/styles/base.css`. Otherwise it
 * flips instantly and the token transition gives a soft colour crossfade.
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
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute(THEME_ATTRIBUTE);
    setTheme(current === "dark" ? "dark" : "light");
    setMounted(true);
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";

    // Commit the theme change. Kept as one closure so it can run either
    // immediately or inside a View Transition snapshot callback.
    const apply = () => {
      setTheme(next);
      document.documentElement.setAttribute(THEME_ATTRIBUTE, next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Safari private mode / disabled storage — soft fail.
      }
    };

    const startViewTransition = (
      document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void> };
      }
    ).startViewTransition;
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // No View Transitions support (Firefox/Safari) or reduced-motion:
    // flip instantly. The token transition in base.css still gives a
    // soft colour crossfade.
    if (!startViewTransition || prefersReduced) {
      apply();
      return;
    }

    // Circular reveal: the incoming theme wipes in as a circle growing
    // from the centre of the toggle button out to the farthest corner.
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = startViewTransition.call(document, () => {
      // flushSync so React commits the icon swap before the snapshot.
      flushSync(apply);
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          // Deliberately longer than `--tds-dur-slow`: this is a full-viewport
          // wipe, not a control's response, and it reads as abrupt below ~450ms.
          duration: 480,
          easing: cssEase.inOut,
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };

  // Render a stable label/icon during SSR + initial paint so the
  // server-rendered button matches the first client paint. Once
  // mounted, the real state takes over.
  const label = mounted && theme === "dark" ? labelToLight : labelToDark;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={flip}
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
        className={mounted && theme === "dark" ? "hidden" : "block"}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
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
        className={mounted && theme === "dark" ? "block" : "hidden"}
      >
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="22" />
        <line x1="2" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="4.93" x2="6.99" y2="6.99" />
        <line x1="17.01" y1="17.01" x2="19.07" y2="19.07" />
        <line x1="4.93" y1="19.07" x2="6.99" y2="17.01" />
        <line x1="17.01" y1="6.99" x2="19.07" y2="4.93" />
      </svg>
    </button>
  );
}
