import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  durations,
  ease,
  fadeUp,
  listItem,
  microFade,
  presence,
  spring,
  stagger,
  transitions,
} from "../motion";

describe("./motion stays plain data", () => {
  it("never imports the Motion runtime", () => {
    // A consumer that only wants a curve (a CSS-only site, the WAAPI in
    // ThemeToggle) must not pull an animation library into its bundle. The
    // React primitives live behind `./motion/react` for exactly this reason.
    const src = readFileSync(join(__dirname, "..", "motion", "index.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']motion/);
    expect(src).not.toMatch(/from\s+["']framer-motion/);
  });
});

describe("transitions", () => {
  it("is the millisecond scale in seconds, derived rather than re-typed", () => {
    for (const key of ["fast", "base", "slow"] as const) {
      expect(transitions[key].duration).toBe(durations[key] / 1000);
      expect(transitions[key].ease).toBe(ease);
    }
  });

  it("settles without bouncing", () => {
    expect(spring.bounce).toBe(0);
    expect(spring.visualDuration).toBe(durations.slow / 1000);
  });
});

describe("presence and listItem", () => {
  it.each([
    ["presence", presence],
    ["listItem", listItem],
  ] as const)("%s always ends fully visible", (_name, preset) => {
    // Reduced motion collapses the transition, never the target: the end
    // state must be opaque whatever the timing does.
    expect(preset.shown.opacity).toBe(1);
    expect(preset.enter.opacity).toBe(0);
    expect(preset.exit.opacity).toBe(0);
  });

  it("leaves faster than it arrives", () => {
    expect(presence.exit.transition.duration).toBeLessThan(presence.shown.transition.duration);
    expect(listItem.exit.transition.duration).toBeLessThan(listItem.shown.transition.duration);
  });
});

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
