import { describe, expect, it } from "vitest";
import { ease, fadeUp, microFade, stagger } from "../motion";

/**
 * The motion presets are plain data consumed by framer-motion in the
 * frontends. They carry no behaviour, but a typo (wrong key, NaN in the
 * cubic-bezier, opacity outside 0..1) silently breaks animations with no
 * other test catching it. Pin the shape and the numeric invariants.
 */
describe("ease", () => {
  it("is a 4-point cubic-bezier with control points in [0,1]", () => {
    expect(ease).toHaveLength(4);
    for (const n of ease) {
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe("fadeUp", () => {
  it("starts transparent and below, ends opaque and in place", () => {
    expect(fadeUp.initial).toEqual({ opacity: 0, y: 24 });
    expect(fadeUp.animate.opacity).toBe(1);
    expect(fadeUp.animate.y).toBe(0);
  });

  it("animates with the shared ease and a positive duration", () => {
    expect(fadeUp.animate.transition.ease).toBe(ease);
    expect(fadeUp.animate.transition.duration).toBeGreaterThan(0);
  });
});

describe("stagger", () => {
  it("staggers children with positive timing", () => {
    const t = stagger.animate.transition;
    expect(t.staggerChildren).toBeGreaterThan(0);
    expect(t.delayChildren).toBeGreaterThanOrEqual(0);
  });
});

describe("microFade", () => {
  it("brightens from a dimmed rest state to full opacity on hover", () => {
    expect(microFade.initial.opacity).toBeGreaterThan(0);
    expect(microFade.initial.opacity).toBeLessThan(1);
    expect(microFade.hover.opacity).toBe(1);
    expect(microFade.hover.transition.ease).toBe(ease);
  });
});
