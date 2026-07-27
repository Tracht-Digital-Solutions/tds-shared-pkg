// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ConfirmDialog from "../components/ConfirmDialog";

/**
 * ConfirmDialog replaces `window.confirm()` for destructive actions.
 *
 * Note on the environment: jsdom 25 implements **none** of the `<dialog>`
 * methods (`showModal`/`close` are `undefined`), so these tests exercise the
 * component's documented feature-detect fallback — the `open` attribute path.
 * A couple of cases install a fake `showModal` to assert the modal path is
 * preferred when the platform does provide it.
 */
afterEach(() => cleanup());

const noop = () => {};

describe("ConfirmDialog", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Weg damit?" onConfirm={noop} onCancel={noop} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows the title and links it as the accessible name", () => {
    render(<ConfirmDialog open title="Nutzer löschen?" onConfirm={noop} onCancel={noop} />);
    const dialog = screen.getByRole("dialog", { hidden: true });
    const heading = screen.getByText("Nutzer löschen?");
    expect(dialog.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.id).not.toBe("");
  });

  it("describes itself with the consequence line only when given one", () => {
    const { rerender } = render(
      <ConfirmDialog open title="X?" onConfirm={noop} onCancel={noop} />,
    );
    expect(screen.getByRole("dialog", { hidden: true }).getAttribute("aria-describedby")).toBe(
      null,
    );
    rerender(
      <ConfirmDialog open title="X?" message="Kann nicht rückgängig gemacht werden." onConfirm={noop} onCancel={noop} />,
    );
    const dialog = screen.getByRole("dialog", { hidden: true });
    const desc = screen.getByText("Kann nicht rückgängig gemacht werden.");
    expect(dialog.getAttribute("aria-describedby")).toBe(desc.id);
  });

  it("is visible without showModal by falling back to the open attribute", () => {
    render(<ConfirmDialog open title="X?" onConfirm={noop} onCancel={noop} />);
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    // The whole point: no showModal in this environment, yet the dialog is not
    // display:none — i.e. the destructive action stays reachable.
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("prefers showModal when the platform implements it", () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    // @ts-expect-error -- installing the method jsdom lacks
    HTMLDialogElement.prototype.showModal = showModal;
    try {
      render(<ConfirmDialog open title="X?" onConfirm={noop} onCancel={noop} />);
      expect(showModal).toHaveBeenCalledTimes(1);
    } finally {
      // @ts-expect-error -- restore the jsdom-native absence
      delete HTMLDialogElement.prototype.showModal;
    }
  });

  it("defaults to a danger confirm button and focuses cancel", () => {
    render(<ConfirmDialog open title="X?" onConfirm={noop} onCancel={noop} />);
    const confirm = screen.getByRole("button", { name: "Löschen", hidden: true });
    const cancel = screen.getByRole("button", { name: "Abbrechen", hidden: true });
    // .btn carries the geometry, .btn-danger only the colour — both required.
    expect(confirm.className.split(/\s+/)).toEqual(expect.arrayContaining(["btn", "btn-danger"]));
    // Focus is asserted on the live activeElement, not on an `autofocus`
    // attribute: React never renders that attribute, so asserting it would
    // pass or fail for reasons unrelated to where focus actually is.
    expect(document.activeElement).toBe(cancel);
  });

  it("uses the primary button and focuses confirm when not destructive", () => {
    render(
      <ConfirmDialog
        open
        destructive={false}
        title="Fortfahren?"
        confirmLabel="Weiter"
        onConfirm={noop}
        onCancel={noop}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Weiter", hidden: true });
    expect(confirm.className.split(/\s+/)).toEqual(expect.arrayContaining(["btn", "btn-primary"]));
    expect(document.activeElement).toBe(confirm);
  });

  it("fires the callbacks on click", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="X?" onConfirm={onConfirm} onCancel={onCancel} />);
    screen.getByRole("button", { name: "Löschen", hidden: true }).click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Abbrechen", hidden: true }).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on a backdrop click but not on a click inside the panel", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="X?" onConfirm={noop} onCancel={onCancel} />);
    const dialog = screen.getByRole("dialog", { hidden: true });
    // A click landing on the <dialog> itself is the ::backdrop.
    dialog.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    // A click on the panel must not dismiss.
    screen.getByText("X?").click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons and swaps in a spinner while busy", () => {
    render(<ConfirmDialog open busy title="X?" onConfirm={noop} onCancel={noop} />);
    const buttons = screen.getAllByRole("button", { hidden: true });
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    // The label is replaced by the shared spinner, never by a "Wird geladen …" line.
    expect(screen.getByRole("dialog", { hidden: true }).textContent).not.toContain("Löschen");
    expect(document.querySelector(".tds-spinner")).not.toBeNull();
  });

  it("ignores a backdrop click while busy so an in-flight action is not orphaned", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open busy title="X?" onConfirm={noop} onCancel={onCancel} />);
    screen.getByRole("dialog", { hidden: true }).click();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("translates the native Escape 'cancel' event into onCancel without self-closing", () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="X?" onConfirm={noop} onCancel={onCancel} />);
    const dialog = screen.getByRole("dialog", { hidden: true }) as HTMLDialogElement;
    const evt = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(evt);
    expect(onCancel).toHaveBeenCalledTimes(1);
    // React stays the source of truth for `open`: the default close is prevented.
    expect(evt.defaultPrevented).toBe(true);
  });
});
