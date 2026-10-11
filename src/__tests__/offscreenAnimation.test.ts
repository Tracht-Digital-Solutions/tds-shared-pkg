// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { offscreenAnimationScript } from "../astro";

/**
 * jsdom has neither IntersectionObserver nor Web Animations, so both are
 * stubbed: the observer hands its callback to the test, and each element
 * carries a list of fake animations.
 */
type Fake = {
  playState: string;
  animationName?: string;
  effect: { target: Element; getComputedTiming: () => { iterations: number } };
  pause: () => void;
  play: () => void;
};

let report: (entries: { target: Element; isIntersecting: boolean }[]) => void;
const observed: Element[] = [];
const byElement = new Map<Element, Fake[]>();

function fake(target: Element, iterations: number, css = false): Fake {
  const a: Fake = {
    playState: "running",
    effect: { target, getComputedTiming: () => ({ iterations }) },
    pause() {
      a.playState = "paused";
    },
    play() {
      a.playState = "running";
    },
  };
  if (css) a.animationName = "spin";
  byElement.set(target, [...(byElement.get(target) ?? []), a]);
  return a;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof report) {
        report = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
    },
  );
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value(this: Element) {
      return byElement.get(this) ?? [];
    },
  });
  Object.defineProperty(document, "getAnimations", {
    configurable: true,
    value: () => [...byElement.values()].flat(),
  });
  Object.defineProperty(document, "readyState", { configurable: true, get: () => "complete" });
  // eslint-disable-next-line no-new-func
  new Function(offscreenAnimationScript)();
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("offscreenAnimationScript", () => {
  it("watches endless animations only, and pauses Web Animations off screen", async () => {
    const decor = document.createElement("span");
    const once = document.createElement("span");
    document.body.append(decor, once);
    const loop = fake(decor, Infinity);
    fake(once, 1);
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(observed).toContain(decor);
    expect(observed).not.toContain(once);

    report([{ target: decor, isIntersecting: false }]);
    expect(decor.hasAttribute("data-tds-offscreen")).toBe(true);
    expect(loop.playState).toBe("paused");

    report([{ target: decor, isIntersecting: true }]);
    expect(decor.hasAttribute("data-tds-offscreen")).toBe(false);
    expect(loop.playState).toBe("running");
  });

  it("leaves CSS animations to the stylesheet and never resumes what it did not pause", () => {
    const spinner = document.createElement("span");
    document.body.append(spinner);
    const css = fake(spinner, Infinity, true);
    const held = fake(spinner, Infinity);
    held.playState = "paused";
    spinner.dispatchEvent(new Event("animationstart", { bubbles: true }));
    expect(observed).toContain(spinner);

    report([{ target: spinner, isIntersecting: false }]);
    expect(css.playState).toBe("running");
    report([{ target: spinner, isIntersecting: true }]);
    expect(held.playState).toBe("paused");
  });

  it("pairs with the stylesheet rule that pauses marked elements", async () => {
    const css = readFileSync(join(__dirname, "../../styles/base.css"), "utf8");
    expect(css).toMatch(/\[data-tds-offscreen\] \*::after \{\s*animation-play-state: paused !important;/);
    await flush();
  });
});
