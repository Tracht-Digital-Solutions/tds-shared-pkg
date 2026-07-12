// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Spinner from "../components/Spinner";

/**
 * Spinner is a presentational, announced loading ring. It always exposes a
 * `status` role with an accessible name, and its size/tone map to CSS modifier
 * classes.
 */
afterEach(() => cleanup());

describe("Spinner", () => {
  it("renders an announced status with the default label", () => {
    render(<Spinner />);
    const el = screen.getByRole("status");
    expect(el.classList.contains("tds-spinner")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("Wird geladen");
  });

  it("applies size + tone modifier classes and a custom label", () => {
    render(<Spinner size="sm" tone="primary" label="Speichern" />);
    const el = screen.getByRole("status");
    expect(el.classList.contains("tds-spinner--sm")).toBe(true);
    expect(el.classList.contains("tds-spinner--primary")).toBe(true);
    expect(el.getAttribute("aria-label")).toBe("Speichern");
  });

  it("uses no size modifier for the medium default", () => {
    render(<Spinner size="md" />);
    const el = screen.getByRole("status");
    expect(el.classList.contains("tds-spinner--sm")).toBe(false);
    expect(el.classList.contains("tds-spinner--lg")).toBe(false);
  });
});
