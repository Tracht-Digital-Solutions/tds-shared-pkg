// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { downloadBlob, downloadBytes, downloadText } from "../download";
import { copyText, useCopyFlag } from "../clipboard";
import { crc32, createZip, readZip, safeZipName, safeZipPath } from "../zip";
import { Alert } from "../alert";
import { RangeField, Segmented, StatusChip, SummaryMetric, TabPanel, Tabs } from "../components";
import { primeRuntimeConfig } from "../api";

afterEach(cleanup);

describe("download", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
  });
  afterEach(() => vi.useRealTimers());

  it("clicks an attached link and revokes the URL afterwards, not before", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      expect(this.download).toBe("a.txt");
    });
    downloadBlob(new Blob(["x"]), "a.txt");
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    expect(document.querySelector("a")).toBeNull();
  });

  it("wraps text and bytes in typed Blobs", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadText("hi", "a.txt");
    downloadBytes(new Uint8Array([1, 2]), "application/pdf", "a.pdf");
    const blobs = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as Blob);
    expect(blobs.map((b) => b.type)).toEqual(["text/plain;charset=utf-8", "application/pdf"]);
    expect(blobs[1]!.size).toBe(2);
  });
});

describe("clipboard", () => {
  it("reports success only when something was copied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await copyText("x")).toBe(true);

    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    document.execCommand = vi.fn(() => false);
    expect(await copyText("x")).toBe(false);
    document.execCommand = vi.fn(() => true);
    expect(await copyText("x")).toBe(true);
  });

  it("raises the flag on success, drops it later and clears its timer on unmount", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useCopyFlag(1500));
    await act(async () => {
      expect(await result.current.copy("x")).toBe(true);
    });
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copied).toBe(false);
    await act(async () => {
      await result.current.copy("y");
    });
    unmount();
    expect(clear).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not claim a failed copy", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    document.execCommand = vi.fn(() => false);
    const { result } = renderHook(() => useCopyFlag());
    await act(async () => {
      expect(await result.current.copy("x")).toBe(false);
    });
    expect(result.current.copied).toBe(false);
  });
});

describe("zip", () => {
  const enc = new TextEncoder();

  it("round-trips entries and checks every CRC", () => {
    const zip = createZip([
      { path: "a/b.txt", data: enc.encode("hallo") },
      { path: "c.css", data: enc.encode("x{}") },
    ]);
    const back = readZip(zip);
    expect(back.map((e) => e.path)).toEqual(["a/b.txt", "c.css"]);
    expect(new TextDecoder().decode(back[0]!.data)).toBe("hallo");
    expect(crc32(enc.encode("123456789"))).toBe(0xcbf43926);
  });

  it("is deterministic by default", () => {
    const entry = [{ path: "a.txt", data: enc.encode("x") }];
    expect(createZip(entry)).toEqual(createZip(entry));
  });

  it("keeps Unicode names only in unicode mode, and never a traversal", () => {
    const umlaut = [{ path: "Prüfbericht.jpg", data: enc.encode("x") }];
    expect(() => createZip(umlaut)).toThrow(/Unsafe/);
    expect(readZip(createZip(umlaut, { names: "unicode", date: new Date() }))[0]!.path).toBe("Prüfbericht.jpg");
    for (const bad of ["../x", "/abs", "a//b", "a/./b"]) {
      expect(safeZipPath(bad)).toBeNull();
      expect(safeZipName(bad)).toBeNull();
    }
    expect(safeZipName('a:b')).toBeNull();
  });
});

describe("Alert", () => {
  it("renders nothing without content", () => {
    const { container } = render(<Alert>{null}</Alert>);
    expect(container.innerHTML).toBe("");
  });

  it("announces danger as an alert and success politely", () => {
    render(
      <>
        <Alert>Kaputt.</Alert>
        <Alert tone="success">Gut.</Alert>
      </>,
    );
    expect(screen.getByRole("alert").className).toBe("tds-alert tds-alert--danger tds-appear");
    expect(screen.getByRole("status").className).toContain("tds-alert--success");
  });

  it("has a CSS rule for every tone", () => {
    const css = readFileSync(join(__dirname, "../../styles/primitives.css"), "utf8");
    for (const tone of ["danger", "warning", "success", "info"]) expect(css).toContain(`.tds-alert--${tone} {`);
  });
});

describe("Tabs", () => {
  it("wires tabs to panels and moves with the arrow keys", () => {
    const onChange = vi.fn();
    render(
      <>
        <Tabs label="Ansicht" idPrefix="t" value="a" onChange={onChange} tabs={[["a", "Eins"], ["b", "Zwei"], ["c", "Drei"]]} />
        <TabPanel idPrefix="t" id="a" active>
          A
        </TabPanel>
        <TabPanel idPrefix="t" id="b" active={false}>
          B
        </TabPanel>
      </>,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]!.getAttribute("aria-controls")).toBe("t-panel-a");
    expect(tabs[0]!.tabIndex).toBe(0);
    expect(tabs[1]!.tabIndex).toBe(-1);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("t-tab-a");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("a");
  });
});

describe("small controls", () => {
  it("Segmented presses the chosen chip", () => {
    const onChange = vi.fn();
    render(<Segmented label="Format" value="png" onChange={onChange} options={[["png", "PNG"], ["svg", "SVG"]]} />);
    expect(screen.getByRole("button", { name: "PNG" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "SVG" }));
    expect(onChange).toHaveBeenCalledWith("svg");
  });

  it("RangeField names its slider and shows the value", () => {
    const onChange = vi.fn();
    render(<RangeField label="Qualität" value={80} unit="%" min={10} max={100} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: /Qualität: 80 %/ });
    fireEvent.change(slider, { target: { value: "60" } });
    expect(onChange).toHaveBeenCalledWith(60);
  });

  it("StatusChip resolves the tone to a real variant", () => {
    render(<StatusChip status="paid" map={{ paid: { label: "Bezahlt", tone: "success" }, void: { label: "Storniert", tone: "muted" } }} />);
    expect(screen.getByText("Bezahlt").className).toBe("chip chip--success");
    cleanup();
    render(<StatusChip status="void" map={{ void: { label: "Storniert", tone: "muted" } }} />);
    expect(screen.getByText("Storniert").className).toBe("chip chip--neutral");
    cleanup();
    render(<StatusChip status="weird" map={{}} />);
    expect(screen.getByText("weird").className).toBe("chip chip--neutral");
  });
});

describe("SummaryMetric", () => {
  beforeEach(() => primeRuntimeConfig(null));

  it("shows the count", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ count: 7 }))));
    render(<SummaryMetric endpoint="/x/summary" caption={() => "Dinge"} />);
    await waitFor(() => expect(screen.getByText("7")).toBeTruthy());
    expect(screen.getByText("Dinge").className).toBe("marginalia");
  });

  it("shows a dash, never a fake zero, when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    render(<SummaryMetric endpoint="/x/summary" />);
    await waitFor(() => expect(screen.getByText("—")).toBeTruthy());
  });

  it("reloads on a notification for its module", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ count: fetch.mock.calls.length })));
    vi.stubGlobal("fetch", fetch);
    render(<SummaryMetric endpoint="/x/summary" refreshOnModule="x" />);
    await waitFor(() => expect(screen.getByText("1")).toBeTruthy());
    window.dispatchEvent(new CustomEvent("tds:notification", { detail: { module: "other" } }));
    window.dispatchEvent(new CustomEvent("tds:notification", { detail: { module: "x" } }));
    await waitFor(() => expect(screen.getByText("2")).toBeTruthy());
  });
});
