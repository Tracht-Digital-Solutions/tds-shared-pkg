import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { THEME_ATTRIBUTE, type Theme } from "../design/index.js";
import { applyThemePreference } from "../theme/index.js";
import { cssEase } from "../motion/index.js";

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
 * `@tracht-digital-solutions/tds-shared/styles/base.css`. On a coarse
 * pointer the new snapshot drops in from the top as a curtain, because the circle
 * is driven by `clip-path` and that is not composited — see the note at
 * the branch. Otherwise it flips instantly and the token transition gives
 * a soft colour crossfade.
 *
 * Icons show the *target* state — moon in light mode (tap to go dark),
 * sun in dark mode (tap to go light), matching the Material/iOS
 * convention.
 *
 * On a fine pointer, hovering the button also PREVIEWS the flip: a circular
 * region follows the cursor and shows where the page is going, darker in light
 * mode and lighter in dark. It lasts exactly as long as the hover. See
 * `.tds-theme-preview` in base.css for the shape, and the note there on why it
 * is a gradient rather than a `clip-path`.
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
  }, []);

  // --- Preview under the pointer --------------------------------------
  // While the button is hovered, a circular region around the cursor shows
  // where the page is going. The shape, the ink and the falloff are
  // `.tds-theme-preview` in base.css (and the note there on why it is a
  // gradient rather than a clip); this only owns the element's life and its
  // two coordinates.
  //
  // Refs throughout, no state: a `pointermove` fires many times per frame and
  // re-rendering the button on each one would be the most expensive way
  // imaginable to move a background.
  // `previewRef` holds the element for as long as it is IN THE DOM, fading
  // included — not only while it is wanted. The distinction is load-bearing
  // twice over: a pointer that re-enters during the fade reuses the element
  // instead of stacking a second one over it, and an unmount during the fade
  // still has something to remove.
  const previewRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);
  const removeTimerRef = useRef(0);
  const pointRef = useRef({ x: 0, y: 0 });

  const paintPreview = () => {
    frameRef.current = 0;
    const el = previewRef.current;
    if (!el) return;
    el.style.setProperty("--tds-theme-preview-x", `${pointRef.current.x}px`);
    el.style.setProperty("--tds-theme-preview-y", `${pointRef.current.y}px`);
  };

  const trackPointer = (event: { clientX: number; clientY: number }) => {
    pointRef.current = { x: event.clientX, y: event.clientY };
    if (!previewRef.current || frameRef.current) return;
    frameRef.current = requestAnimationFrame(paintPreview);
  };

  const discardPreview = () => {
    if (removeTimerRef.current) {
      clearTimeout(removeTimerRef.current);
      removeTimerRef.current = 0;
    }
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    previewRef.current?.remove();
    previewRef.current = null;
  };

  const closePreview = () => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const el = previewRef.current;
    if (!el || removeTimerRef.current) return;
    el.removeAttribute("data-visible");
    // A timer rather than `transitionend`: a pointer that entered and left
    // inside one frame never reached opacity 1, so no transition runs and no
    // event arrives — and an overlay left behind is invisible, permanent and
    // sits over the whole page.
    //
    // The duration comes from the element's own computed style, so the CSS
    // stays the single source of truth and a change to `--tds-dur-base` cannot
    // leave this timer firing mid-fade. `40` is the margin for the frame the
    // attribute removal lands on; the fallback covers a detached document.
    const fade = parseFloat(getComputedStyle(el).transitionDuration) || 0.2;
    removeTimerRef.current = window.setTimeout(discardPreview, fade * 1000 + 40);
  };

  const openPreview = (event: { clientX: number; clientY: number }) => {
    // Nothing on a touch screen: there is no hover state to preview under, a
    // finger covers the circle it would draw, and the tap flips the theme for
    // real a moment later.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen — either still shown (a second `pointerenter` without
    // a leave) or mid-fade. Either way, take it back rather than build another.
    let el = previewRef.current;
    if (el) {
      if (removeTimerRef.current) {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = 0;
      }
    } else {
      el = document.createElement("div");
      el.className = "tds-theme-preview";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
      previewRef.current = el;
    }
    // Place it BEFORE it becomes visible, or the first frame fades in at the
    // centre of the viewport and slides to the cursor.
    pointRef.current = { x: event.clientX, y: event.clientY };
    paintPreview();
    const target = el;
    requestAnimationFrame(() => {
      if (previewRef.current === target) target.setAttribute("data-visible", "true");
    });
  };

  // NATIVE listeners, not `onPointerEnter`/`onPointerLeave` props, and the
  // reason is React's event system rather than preference: React synthesises
  // enter and leave from delegated `pointerover`/`pointerout` at the root. The
  // two SVGs inside the button are event targets of their own, so the
  // synthesised pair is sensitive to which child the pointer crossed into —
  // and `fireEvent.pointerEnter` in a test never reaches the synthesis at all.
  // The native events do not bubble and never fire for a move between
  // children, which is exactly the semantics wanted here.
  //
  // Unmounting mid-hover also has to take the overlay with it: it is a child
  // of `document.body`, so React will not collect it.
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    const onEnter = (event: PointerEvent) => openPreview(event);
    const onMove = (event: PointerEvent) => trackPointer(event);
    button.addEventListener("pointerenter", onEnter);
    button.addEventListener("pointermove", onMove);
    button.addEventListener("pointerleave", closePreview);
    button.addEventListener("pointercancel", closePreview);
    // Keyboard focus leaving the button ends the preview too. A pointer parked
    // on the toggle while the visitor tabs away is the one case
    // `pointerleave` never fires for.
    button.addEventListener("blur", closePreview);
    return () => {
      button.removeEventListener("pointerenter", onEnter);
      button.removeEventListener("pointermove", onMove);
      button.removeEventListener("pointerleave", closePreview);
      button.removeEventListener("pointercancel", closePreview);
      button.removeEventListener("blur", closePreview);
      // Immediately, fade or no fade — nothing is left to watch it finish.
      discardPreview();
    };
    // The handlers read refs only, so the first closure stays correct for the
    // component's whole life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setFlipped(true);
    // The real transition is about to run over the whole viewport; a preview
    // of it still lying on top would darken its destination.
    closePreview();

    // Commit the theme change. Kept as one closure so it can run either
    // immediately or inside a View Transition snapshot callback.
    //
    // Storage + attribute + the `tds:theme-change` announcement all happen in
    // `applyThemePreference` (tds-shared/theme), the single write path — that
    // is what lets the frontend host persist the choice per USER without this
    // component knowing a server exists. The toggle only ever writes an
    // explicit theme; "System" is chosen on the profile page.
    const apply = () => {
      setTheme(next);
      applyThemePreference(next);
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

    // Touch devices get a DIFFERENT reveal, and the reason is the
    // compositor, not taste: `clip-path` is not a compositor-animatable
    // property in Chromium, so every frame of the circular wipe repaints a
    // full-viewport layer. On a desktop GPU that disappears; on a phone the
    // wipe visibly stutters — and it is worst on exactly the pages that
    // earn it, the ones with a frosted fixed header and large soft fields
    // underneath. `opacity` and `transform` ARE composited, so the same
    // "new theme arrives over the old" reading costs no repaint at all.
    //
    // Chosen on pointer, not on width: a small window on a desktop has the
    // GPU to spare, and a large tablet does not.
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    if (coarsePointer) {
      const transition = startViewTransition.call(document, () => {
        flushSync(apply);
      });

      // A CURTAIN, from the top edge the toggle sits on. The fade-and-settle
      // this replaced read as a flicker on a phone: the whole viewport
      // blinked once and nothing told the eye where the new theme came from.
      // The new snapshot drops in from above with a small overshoot and the
      // old one gives way downwards underneath it. Both are `transform` only,
      // so the compositor moves two finished bitmaps and nothing repaints —
      // the reason this branch exists at all (see above).
      //
      // The old snapshot travels 10 % while the new one travels 100 %, and
      // the new one leads (ease-out against ease-in-out), so no gap opens
      // between the falling edge and the page it covers.
      transition.ready.then(() => {
        document.documentElement.animate(
          [
            { transform: "translateY(-100%)" },
            { transform: "translateY(1.5%)", offset: 0.78 },
            { transform: "translateY(0)" },
          ],
          {
            duration: 560,
            easing: cssEase.out,
            pseudoElement: "::view-transition-new(root)",
          },
        );
        document.documentElement.animate(
          { transform: ["translateY(0)", "translateY(10%)"] },
          {
            duration: 560,
            easing: cssEase.inOut,
            pseudoElement: "::view-transition-old(root)",
          },
        );
      });
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
        className={`${mounted && theme === "dark" ? "hidden" : "block"}${flipped ? " tds-theme-toggle__icon--turn" : ""}`}
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
        className={`${mounted && theme === "dark" ? "block" : "hidden"}${flipped ? " tds-theme-toggle__icon--turn" : ""}`}
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
