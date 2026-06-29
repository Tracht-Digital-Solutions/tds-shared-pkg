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

  it("uses a button with type=button (never submits a form)", () => {
    const { getByRole } = render(<ThemeToggle />);
    expect(getByRole("button").getAttribute("type")).toBe("button");
  });
});
