// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import ThemeToggle from "../components/ThemeToggle";

/**
 * ThemeToggle flips `<html data-theme>` and persists to localStorage. In
 * jsdom there is no View Transitions API and matchMedia is stubbed, so
 * the component takes the "flip instantly" branch — which is exactly the
 * logic we want to assert (state + DOM attr + storage), independent of
 * the animation.
 */
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  // jsdom has no matchMedia; provide a reduced-motion=false stub so the
  // component falls through to the instant-flip path.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  // The preview overlay is a child of document.body with a timed removal.
  // `cleanup()` unmounts the component, which discards it — this is the guard
  // that one leaking would fail its own test rather than the next five.
  for (const stray of document.querySelectorAll(".tds-theme-preview")) stray.remove();
});

describe("ThemeToggle", () => {
  it("renders the dark-target label when the document is light", () => {
    const { getByRole } = render(<ThemeToggle labelToDark="Dark" labelToLight="Light" />);
    expect(getByRole("button").getAttribute("aria-label")).toBe("Dark");
  });

  it("adopts the document's initial dark theme on mount", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    const { getByRole } = render(<ThemeToggle labelToDark="Dark" labelToLight="Light" />);
    expect(getByRole("button").getAttribute("aria-label")).toBe("Light");
  });

  it("flips the document theme and persists it on click", () => {
    const { getByRole } = render(<ThemeToggle />);
    fireEvent.click(getByRole("button"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("tds-theme")).toBe("dark");
  });

  it("toggles back to light on a second click", () => {
    const { getByRole } = render(<ThemeToggle />);
    const btn = getByRole("button");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("tds-theme")).toBe("light");
  });

  it("drops the new theme in as a transform-only curtain on a coarse pointer", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query === "(pointer: coarse)", addEventListener: vi.fn() })),
    );
    const animate = vi.fn();
    document.documentElement.animate = animate as unknown as typeof document.documentElement.animate;
    const ready = Promise.resolve();
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => {
      cb();
      return { ready };
    };
    try {
      const { getByRole } = render(<ThemeToggle />);
      fireEvent.click(getByRole("button"));
      await ready;
      await Promise.resolve();
      expect(animate).toHaveBeenCalledTimes(2);
      for (const [keyframes, options] of animate.mock.calls) {
        // Composited properties only — a clip-path here repaints every frame.
        expect(JSON.stringify(keyframes)).not.toMatch(/clip|opacity/i);
        expect(JSON.stringify(keyframes)).toContain("translateY");
        expect(options.pseudoElement).toMatch(/^::view-transition-(new|old)\(root\)$/);
      }
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      // The icon that appeared carries the turn.
      expect(getByRole("button").querySelector(".tds-theme-toggle__icon--turn")).not.toBeNull();
    } finally {
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    }
  });

  it("uses a button with type=button (never submits a form)", () => {
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole("button").getAttribute("type")).toBe("button");
  });

  /**
   * The hover preview. The negative cases come first, because the failure
   * mode is a full-viewport overlay left lying on a page nobody is hovering.
   */
  describe("preview under the pointer", () => {
    const finePointer = () =>
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
          matches: query === "(hover: hover) and (pointer: fine)",
          addEventListener: vi.fn(),
        })),
      );
    const preview = () => document.querySelector(".tds-theme-preview");

    it("opens a preview on a fine pointer and closes it on leave", () => {
      finePointer();
      const { getByRole } = render(<ThemeToggle />);
      const btn = getByRole("button");

      fireEvent.pointerEnter(btn, { clientX: 120, clientY: 64 });
      const el = preview();
      expect(el).not.toBeNull();
      expect(el?.getAttribute("aria-hidden")).toBe("true");
      // Positioned before it is visible, or it fades in mid-viewport and
      // slides to the cursor.
      expect((el as HTMLElement).style.getPropertyValue("--tds-theme-preview-x")).toBe("120px");
      expect((el as HTMLElement).style.getPropertyValue("--tds-theme-preview-y")).toBe("64px");

      fireEvent.pointerLeave(btn);
      expect(preview()?.getAttribute("data-visible")).toBeNull();
    });

    it("never opens one under reduced motion", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn((query: string) => ({
          // Both true: a fine pointer that has asked for less motion.
          matches:
            query === "(hover: hover) and (pointer: fine)" ||
            query === "(prefers-reduced-motion: reduce)",
          addEventListener: vi.fn(),
        })),
      );
      const { getByRole } = render(<ThemeToggle />);
      fireEvent.pointerEnter(getByRole("button"), { clientX: 10, clientY: 10 });
      expect(preview()).toBeNull();
    });

    it("never opens one on a touch screen", () => {
      // The default stub answers false to everything, including the
      // hover+fine query — a coarse pointer.
      const { getByRole } = render(<ThemeToggle />);
      fireEvent.pointerEnter(getByRole("button"), { clientX: 10, clientY: 10 });
      expect(preview()).toBeNull();
    });

    it("opens only one overlay however many enters arrive", () => {
      finePointer();
      const { getByRole } = render(<ThemeToggle />);
      const btn = getByRole("button");
      fireEvent.pointerEnter(btn, { clientX: 10, clientY: 10 });
      fireEvent.pointerEnter(btn, { clientX: 20, clientY: 20 });
      fireEvent.pointerEnter(btn, { clientX: 30, clientY: 30 });
      expect(document.querySelectorAll(".tds-theme-preview")).toHaveLength(1);
    });

    it("closes the preview when the theme actually flips", () => {
      finePointer();
      const { getByRole } = render(<ThemeToggle />);
      const btn = getByRole("button");
      fireEvent.pointerEnter(btn, { clientX: 10, clientY: 10 });
      expect(preview()).not.toBeNull();
      fireEvent.click(btn);
      // A preview of the destination still lying over the destination would
      // darken it.
      expect(preview()?.getAttribute("data-visible")).toBeNull();
    });

    it("shows a CLONE of the page in the target theme", () => {
      finePointer();
      // Something identifiable on the page, with an id and a script beside it.
      const page = document.createElement("main");
      page.innerHTML =
        '<h1 id="headline">Hallo</h1><script>window.__ran = 1;<\/script><input name="email">';
      document.body.appendChild(page);
      try {
        const { getByRole } = render(<ThemeToggle />);
        fireEvent.pointerEnter(getByRole("button"), { clientX: 10, clientY: 10 });
        const clone = preview()?.querySelector(".tds-theme-preview__page");
        expect(clone, "the preview holds a copy of the page").not.toBeNull();
        // The copy is in the OTHER theme — that is the whole point, and it works
        // only because base.css matches a bare `[data-theme="dark"]`.
        expect(clone?.getAttribute("data-theme")).toBe("dark");
        expect(clone?.textContent).toContain("Hallo");

        // No duplicate ids: a second `#headline` breaks getElementById,
        // `:target`, label pairing and every aria reference on the REAL page.
        expect(document.querySelectorAll("#headline")).toHaveLength(1);
        // No duplicate control names: a cloned radio group would steal the
        // real one's selection.
        expect(clone?.querySelector("[name]")).toBeNull();
        // Scripts never travel. `cloneNode` does not run them, but appending one
        // to the document would.
        expect(clone?.querySelector("script")).toBeNull();
        // Nothing inside is focusable or announced.
        expect((clone as HTMLElement).inert).toBe(true);
        expect(preview()?.getAttribute("aria-hidden")).toBe("true");
      } finally {
        page.remove();
      }
    });

    it("never clones a preview into a preview", () => {
      finePointer();
      const { getByRole } = render(<ThemeToggle />);
      const btn = getByRole("button");
      fireEvent.pointerEnter(btn, { clientX: 10, clientY: 10 });
      fireEvent.pointerLeave(btn);
      // Still in the DOM during its fade, and it is a child of body — so the
      // next open would copy it into itself and nest a page per hover.
      fireEvent.pointerEnter(btn, { clientX: 20, clientY: 20 });
      expect(
        document.querySelectorAll(".tds-theme-preview .tds-theme-preview"),
      ).toHaveLength(0);
    });

    it("takes the overlay with it when unmounted mid-hover", () => {
      finePointer();
      const { getByRole, unmount } = render(<ThemeToggle />);
      fireEvent.pointerEnter(getByRole("button"), { clientX: 10, clientY: 10 });
      expect(preview()).not.toBeNull();
      unmount();
      // It is a child of document.body, so React does not collect it.
      expect(preview()).toBeNull();
    });
  });
});
