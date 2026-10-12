// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FileDropZone, matchesAccept, partitionFiles } from "../dropzone";

afterEach(cleanup);

const file = (name: string, type: string) => new File(["x"], name, { type });
const pdf = file("a.pdf", "application/pdf");
const jpg = file("b.jpg", "image/jpeg");
const txt = file("c.txt", "text/plain");

/** A drag event's dataTransfer as jsdom cannot build one. */
const transfer = (files: File[]) => ({ files, types: ["Files"], dropEffect: "none" });

describe("matchesAccept", () => {
  it("takes everything without an accept string", () => {
    expect(matchesAccept(txt)).toBe(true);
    expect(matchesAccept(txt, " ")).toBe(true);
  });

  it("matches MIME types, wildcards and extensions, case-insensitively", () => {
    expect(matchesAccept(pdf, "application/pdf")).toBe(true);
    expect(matchesAccept(jpg, "image/*")).toBe(true);
    expect(matchesAccept(file("SCAN.PDF", ""), ".pdf")).toBe(true);
    expect(matchesAccept(txt, "image/*,.pdf")).toBe(false);
  });

  it("limits a single-file zone to the first accepted file", () => {
    const { accepted, rejected } = partitionFiles([txt, pdf, file("d.pdf", "application/pdf")], ".pdf");
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(rejected).toEqual([txt]);
  });
});

describe("FileDropZone", () => {
  it("names the input after its label and describes it with the hint", () => {
    render(<FileDropZone label="PDF auswählen" hint="oder hierher ziehen" onFiles={() => {}} />);
    const input = screen.getByLabelText("PDF auswählen");
    expect(input.getAttribute("type")).toBe("file");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
      "oder hierher ziehen",
    );
  });

  it("hands over picked files and shows their names", async () => {
    const onFiles = vi.fn();
    render(<FileDropZone label="Dateien" multiple onFiles={onFiles} />);
    await userEvent.setup().upload(screen.getByLabelText("Dateien"), [pdf, jpg]);
    expect(onFiles).toHaveBeenCalledWith([pdf, jpg]);
    expect(screen.getByText("a.pdf, b.jpg")).toBeDefined();
  });

  it("hands over dropped files, filtered by accept, and reports the rest", () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    const { container } = render(
      <FileDropZone label="PDF" accept="application/pdf" multiple onFiles={onFiles} onReject={onReject} />,
    );
    fireEvent.drop(container.firstChild as Element, { dataTransfer: transfer([pdf, txt]) });
    expect(onFiles).toHaveBeenCalledWith([pdf]);
    expect(onReject).toHaveBeenCalledWith([txt]);
  });

  it("calls nothing when every dropped file is rejected", () => {
    const onFiles = vi.fn();
    const { container } = render(<FileDropZone label="PDF" accept=".pdf" onFiles={onFiles} />);
    fireEvent.drop(container.firstChild as Element, { dataTransfer: transfer([txt]) });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("marks the zone while files hover and swaps in the active label", () => {
    const { container } = render(<FileDropZone label="Bilder" activeLabel="Loslassen" onFiles={() => {}} />);
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: transfer([jpg]) });
    expect(zone.hasAttribute("data-over")).toBe(true);
    expect(screen.getByText("Loslassen")).toBeDefined();

    fireEvent.dragLeave(zone, { relatedTarget: document.body });
    expect(zone.hasAttribute("data-over")).toBe(false);
    expect(screen.getByText("Bilder")).toBeDefined();
  });

  it("ignores a drag that carries no files", () => {
    const { container } = render(<FileDropZone label="Bilder" onFiles={() => {}} />);
    const zone = container.firstChild as HTMLElement;
    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ["text/plain"] } });
    expect(zone.hasAttribute("data-over")).toBe(false);
  });

  it("calls attention to itself while files are dragged anywhere over the page", () => {
    const { container } = render(<FileDropZone label="Bilder" onFiles={() => {}} />);
    const zone = container.firstChild as HTMLElement;
    const drag = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "dataTransfer", { value: transfer([jpg]) });
      act(() => {
        document.body.dispatchEvent(e);
      });
      return e;
    };

    drag("dragenter");
    expect(zone.hasAttribute("data-page-drag")).toBe(true);
    // A drop that misses the zone must not let the browser navigate to the file.
    expect(drag("drop").defaultPrevented).toBe(true);
    expect(zone.hasAttribute("data-page-drag")).toBe(false);
  });

  it("pops once after a drop and clears the state when the animation ends", () => {
    const { container } = render(<FileDropZone label="Bilder" onFiles={() => {}} />);
    const zone = container.firstChild as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: transfer([jpg]) });
    expect(zone.hasAttribute("data-dropped")).toBe(true);

    // The icon's own animation ending does not cut the zone's pop short.
    fireEvent.animationEnd(zone.querySelector("svg")!);
    expect(zone.hasAttribute("data-dropped")).toBe(true);
    fireEvent.animationEnd(zone);
    expect(zone.hasAttribute("data-dropped")).toBe(false);
  });

  it("takes pasted files only when asked to, and never from a text field", () => {
    const onFiles = vi.fn();
    const paste = (target: EventTarget) => {
      const e = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(e, "clipboardData", { value: { files: [jpg] } });
      act(() => {
        target.dispatchEvent(e);
      });
    };

    const { rerender } = render(<FileDropZone label="Bilder" onFiles={onFiles} />);
    paste(document.body);
    expect(onFiles).not.toHaveBeenCalled();

    rerender(<FileDropZone label="Bilder" paste onFiles={onFiles} />);
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    paste(field);
    expect(onFiles).not.toHaveBeenCalled();
    paste(document.body);
    expect(onFiles).toHaveBeenCalledWith([jpg]);
    field.remove();
  });

  it("takes nothing while disabled", () => {
    const onFiles = vi.fn();
    const { container } = render(<FileDropZone label="Bilder" disabled onFiles={onFiles} />);
    fireEvent.drop(container.firstChild as Element, { dataTransfer: transfer([jpg]) });
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe(".tds-dropzone styles", () => {
  const css = readFileSync(join(__dirname, "..", "..", "styles", "primitives.css"), "utf8");
  // The drop zone block is the last section of the file, so its reduced-motion
  // rule is the last one.
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));

  it("styles every state the component sets", () => {
    for (const state of ["data-over", "data-page-drag", "data-dropped", "data-disabled"]) {
      expect(css, state).toContain(`.tds-dropzone[${state}]`);
    }
  });

  it("draws no line around itself (the tools site is flat)", () => {
    const block = css.slice(css.indexOf(".tds-dropzone {"), css.indexOf("}", css.indexOf(".tds-dropzone {")));
    expect(block).not.toMatch(/border(-width)?:/);
    expect(block).not.toMatch(/outline:/);
  });

  it("moves only without a reduced-motion preference and resets under one", () => {
    expect(reduced).toMatch(/\.tds-dropzone[\s\S]*transform:\s*none/);
    expect(reduced).toMatch(/animation:\s*none/);
  });
});
