// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRM_FLAG_MS, countUp, flagConfirmed } from "../motion/dom";

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

function placeOffScreen(el: HTMLElement) {
  el.getBoundingClientRect = () => ({ top: 5000, bottom: 5020 }) as DOMRect;
}

describe("flagConfirmed", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sets the flag for its lifetime and removes it afterwards", () => {
    const button = document.createElement("button");
    flagConfirmed(button, "copied");
    expect(button.hasAttribute("data-copied")).toBe(true);
    vi.advanceTimersByTime(CONFIRM_FLAG_MS);
    expect(button.hasAttribute("data-copied")).toBe(false);
  });

  it("restarts the timer when confirmed again", () => {
    const button = document.createElement("button");
    flagConfirmed(button);
    vi.advanceTimersByTime(CONFIRM_FLAG_MS - 100);
    flagConfirmed(button);
    vi.advanceTimersByTime(200);
    expect(button.hasAttribute("data-done")).toBe(true);
  });

  it("clears early through the returned function", () => {
    const button = document.createElement("button");
    const clear = flagConfirmed(button);
    clear();
    expect(button.hasAttribute("data-done")).toBe(false);
  });
});

describe("countUp", () => {
  let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void>;

  beforeEach(() => {
    observed = [];
    setReducedMotion(false);
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        observed.push(cb);
      }
      observe() {}
      disconnect() {}
    };
  });

  it("leaves the rendered number alone under reduced motion", () => {
    setReducedMotion(true);
    const el = document.createElement("span");
    el.textContent = "+8 Jahre";
    placeOffScreen(el);
    countUp(el);
    expect(el.textContent).toBe("+8 Jahre");
  });

  it("leaves a number that is already on screen alone", () => {
    const el = document.createElement("span");
    el.textContent = "+8 Jahre";
    el.getBoundingClientRect = () => ({ top: 10, bottom: 30 }) as DOMRect;
    countUp(el);
    expect(el.textContent).toBe("+8 Jahre");
  });

  it("starts an off-screen number from zero and keeps the text around it", () => {
    const el = document.createElement("span");
    el.textContent = "+8 Jahre";
    placeOffScreen(el);
    countUp(el);
    expect(el.textContent).toBe("+0 Jahre");
    expect(observed).toHaveLength(1);
  });

  it("ends on the server text verbatim, decimals included", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    const el = document.createElement("span");
    el.textContent = "8,5 Jahre";
    placeOffScreen(el);
    countUp(el, { durationMs: 100 });
    observed[0]!([{ isIntersecting: true }]);
    now = 50;
    frames.shift()!(now);
    expect(el.textContent).not.toBe("8,5 Jahre");
    now = 200;
    frames.shift()!(now);
    expect(el.textContent).toBe("8,5 Jahre");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores the server text on cleanup", () => {
    const el = document.createElement("span");
    el.textContent = "1.234 Stunden";
    placeOffScreen(el);
    const stop = countUp(el, { locale: "de-DE" });
    expect(el.textContent).toBe("0 Stunden");
    stop();
    expect(el.textContent).toBe("1.234 Stunden");
  });
});
