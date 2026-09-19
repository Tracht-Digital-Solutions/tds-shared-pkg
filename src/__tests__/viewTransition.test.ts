// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { transitionUpdate, VIEW_TRANSITION_SCOPE } from "../motion";

/**
 * transitionUpdate must never lose the update itself: every path — no API,
 * old API, reduced motion — ends in exactly the same DOM, and only the
 * animation differs. The names must be live only during the transition.
 */
type Doc = { startViewTransition?: unknown };

afterEach(() => {
  delete (document as unknown as Doc).startViewTransition;
  vi.unstubAllGlobals();
  document.documentElement.classList.remove(VIEW_TRANSITION_SCOPE);
});

describe("transitionUpdate", () => {
  it("just updates where the API does not exist", () => {
    const update = vi.fn();
    transitionUpdate(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("just updates under reduced motion, without starting a transition", () => {
    const start = vi.fn();
    (document as unknown as Doc).startViewTransition = start;
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    const update = vi.fn();
    transitionUpdate(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it("starts a typed transition and scopes the names to its lifetime", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const start = vi.fn((arg: { update: () => void; types: string[] }) => {
      expect(document.documentElement.classList.contains(VIEW_TRANSITION_SCOPE)).toBe(true);
      arg.update();
      return { finished };
    });
    (document as unknown as Doc).startViewTransition = start;
    const update = vi.fn();
    transitionUpdate(update, ["list"]);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[0]).toMatchObject({ types: ["list"] });
    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.classList.contains(VIEW_TRANSITION_SCOPE)).toBe(false);
  });

  it("falls back to the callback form where the options object throws", () => {
    const update = vi.fn();
    (document as unknown as Doc).startViewTransition = vi.fn((arg: unknown) => {
      if (typeof arg !== "function") throw new TypeError("not a function");
      (arg as () => void)();
      return { finished: Promise.resolve() };
    });
    transitionUpdate(update);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
