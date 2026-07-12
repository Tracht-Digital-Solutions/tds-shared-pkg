// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Skeleton from "../components/Skeleton";
import SkeletonText from "../components/SkeletonText";

/**
 * Skeleton primitives are decorative placeholders (aria-hidden) — the pending
 * state is announced by the surrounding container, not each block.
 */
afterEach(() => cleanup());

describe("Skeleton", () => {
  it("renders a decorative block with the base class and applied dimensions", () => {
    const { container } = render(<Skeleton width="30%" height="2rem" />);
    const el = container.firstChild as HTMLElement;
    expect(el.classList.contains("tds-skeleton")).toBe(true);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.width).toBe("30%");
    expect(el.style.height).toBe("2rem");
  });

  it("adds the circle modifier when circle is set", () => {
    const { container } = render(<Skeleton circle width="2rem" height="2rem" />);
    const el = container.firstChild as HTMLElement;
    expect(el.classList.contains("tds-skeleton--circle")).toBe(true);
  });
});

describe("SkeletonText", () => {
  it("renders the requested number of lines with a shorter last line", () => {
    const { container } = render(<SkeletonText lines={4} lastLineWidth="50%" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains("tds-skeleton-text")).toBe(true);
    const lines = wrapper.querySelectorAll(".tds-skeleton");
    expect(lines.length).toBe(4);
    expect((lines[3] as HTMLElement).style.width).toBe("50%");
    expect((lines[0] as HTMLElement).style.width).toBe("100%");
  });
});
