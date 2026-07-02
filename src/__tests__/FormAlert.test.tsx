// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FormAlert from "../components/FormAlert";

/**
 * FormAlert is a presentational error banner: it renders an announced alert
 * when it has a message and nothing at all when it doesn't, so callers can
 * mount it unconditionally.
 */
afterEach(() => cleanup());

describe("FormAlert", () => {
  it("renders nothing when there is no message", () => {
    const { container } = render(<FormAlert message={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders an announced alert with the message when set", () => {
    render(<FormAlert message="Falsche E-Mail oder Passwort." />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Falsche E-Mail oder Passwort.");
    expect(alert.classList.contains("form-alert")).toBe(true);
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });
});
