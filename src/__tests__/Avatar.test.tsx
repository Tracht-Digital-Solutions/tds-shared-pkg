// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import Avatar from "../components/Avatar";
import { CATEGORICAL_CHIP_VARIANTS } from "../design";

/**
 * Avatar is the shell's identity marker. Two things about it are load-bearing
 * rather than cosmetic: the fallback must never leave an empty circle (it sits
 * in the top-right of every panel page, where a blank box reads as a bug), and
 * the tint must be STABLE per person, or the same user is a different colour in
 * the menu than in a user list.
 */
afterEach(() => cleanup());

describe("Avatar", () => {
  it("renders the image when a src is given", () => {
    render(<Avatar name="Julian Tracht" src="https://example.test/a.png" />);
    const img = screen.getByRole("img", { name: "Julian Tracht" });
    expect(img.tagName).toBe("IMG");
    expect(img.classList.contains("tds-avatar")).toBe(true);
  });

  it("falls back to initials when the image fails to load", () => {
    // Avatars point at a service that may not be deployed yet; the browser's
    // broken-image glyph in the shell's top-right looks like a defect.
    render(<Avatar name="Julian Tracht" src="https://example.test/gone.png" />);
    fireEvent.error(screen.getByRole("img", { name: "Julian Tracht" }));
    const el = screen.getByRole("img", { name: "Julian Tracht" });
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("JT");
  });

  it("takes initials from the first and last word", () => {
    render(<Avatar name="Anna Maria Sophie Beispiel" />);
    expect(screen.getByRole("img").textContent).toBe("AB");
  });

  it("handles a single word and a name outside the BMP", () => {
    const { rerender } = render(<Avatar name="Julian" />);
    expect(screen.getByRole("img").textContent).toBe("J");
    // A surrogate pair cut with charAt would render a replacement character.
    rerender(<Avatar name="🐙 Krake" />);
    expect(screen.getByRole("img").textContent).toBe("🐙K");
  });

  it("never renders an empty circle", () => {
    const { rerender } = render(<Avatar />);
    expect(screen.getByRole("img").textContent).toBe("?");
    rerender(<Avatar name="   " />);
    expect(screen.getByRole("img").textContent).toBe("?");
  });

  it("gives the same seed the same tint, and only tints the library defines", () => {
    const { rerender } = render(<Avatar name="Julian Tracht" seed={42} />);
    const first = screen.getByRole("img").getAttribute("data-avatar-variant");
    rerender(<Avatar name="Ganz Anders" seed={42} />);
    expect(screen.getByRole("img").getAttribute("data-avatar-variant")).toBe(first);
    expect(CATEGORICAL_CHIP_VARIANTS).toContain(first);
  });

  it("hides itself from screen readers when decorative", () => {
    // Next to the same person's name, an announced avatar says it twice.
    const { container } = render(<Avatar name="Julian Tracht" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector(".tds-avatar")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("applies the size modifier classes", () => {
    const { rerender } = render(<Avatar name="J" size="sm" />);
    expect(screen.getByRole("img").classList.contains("tds-avatar--sm")).toBe(true);
    rerender(<Avatar name="J" size="lg" />);
    expect(screen.getByRole("img").classList.contains("tds-avatar--lg")).toBe(true);
  });
});
