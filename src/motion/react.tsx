/**
 * The React half of the motion layer — `@tracht-digital-solutions/tds-shared/motion/react`.
 *
 * Five primitives for the state changes CSS cannot animate: something leaving
 * the DOM, a list reflowing around it, a shared element gliding between two
 * places. Everything that CSS CAN do (page transitions, scroll reveals, a
 * `<details>` opening, a dropdown fading in) stays in CSS — see `.tds-reveal`,
 * `.tds-disclosure` and `styles/page-transitions.css`.
 *
 * Three rules every primitive here keeps, so a caller does not have to:
 *
 * 1. **The first mount never animates.** `AnimatePresence initial={false}` /
 *    `initial={false}` everywhere. An Astro island server-renders its
 *    `initial` state into the HTML, and `opacity: 0` there means "blank until
 *    hydration" — the landingpage hero's 4.1s mobile LCP before 0.31. Only a
 *    change AFTER hydration moves; the SSR HTML is always the finished state.
 * 2. **Reduced motion is honoured centrally.** `MotionConfig
 *    reducedMotion="user"` drops transform and layout movement; `Collapse`,
 *    the one primitive that animates size, zeroes its own duration. The end
 *    state is always reached — a reduced-motion user must never be left
 *    looking at a half-faded element.
 * 3. **Small and compositor-friendly.** `LazyMotion` + `m.*` (never the full
 *    `motion.*` component), opacity/transform only, `layout` for reflow (FLIP,
 *    i.e. transforms). Timing comes from `../motion` — one curve, one scale,
 *    shared with the `--tds-dur-*` / `--tds-ease-*` CSS tokens.
 */
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  domMax,
  m,
  useReducedMotion,
} from "motion/react";
import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { listItem, presence, spring, transitions } from "./index";

/**
 * DOM props a primitive passes through. Motion redefines the drag and
 * animation handlers with its own signatures, so the React DOM versions are
 * left out rather than silently mistyped.
 */
type PassThrough<T extends "div" | "li"> = Omit<
  ComponentPropsWithoutRef<T>,
  "children" | "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

export interface MotionScopeProps {
  children: ReactNode;
  /**
   * `"animation"` (default) covers enter/exit/variants. `"layout"` adds the
   * layout-projection engine that `layout` and `layoutId` need — about 10 KB
   * more, so only the primitives that reflow ask for it.
   */
  features?: "animation" | "layout";
}

/**
 * Loads Motion's feature set for its subtree and applies the reduced-motion
 * policy. Every primitive below wraps itself in one, because an Astro page has
 * up to 17 separate React roots and no provider to hang this on. Nesting is
 * cheap: features load once, globally.
 */
export function MotionScope({ children, features = "animation" }: MotionScopeProps) {
  return (
    <LazyMotion features={features === "layout" ? domMax : domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

type ContainerTag = "div" | "section" | "article" | "ul" | "ol" | "li" | "p";

export interface PresenceProps extends PassThrough<"div"> {
  /**
   * Identity of what is on screen (deliberately not called `id`, which is
   * the HTML attribute). A new value cross-fades the old content out and the
   * new one in — `view === "list" ? "list" : `detail-${id}``.
   */
  view: string | number;
  children: ReactNode;
  /** Element the swapped content is wrapped in. Defaults to `div`. */
  as?: ContainerTag;
}

/**
 * A view that swaps in place: list ↔ detail, one tab panel for another, a form
 * for its success message. The old view leaves first (`mode="wait"`), so the
 * two never overlap in the same box.
 */
export function Presence({ view, children, as = "div", ...rest }: PresenceProps) {
  const Tag = m[as] as typeof m.div;
  return (
    <MotionScope>
      <AnimatePresence mode="wait" initial={false}>
        <Tag
          key={view}
          {...rest}
          initial={presence.enter}
          animate={presence.shown}
          exit={presence.exit}
        >
          {children}
        </Tag>
      </AnimatePresence>
    </MotionScope>
  );
}

type ListTag = "ul" | "ol" | "div";

export type AnimatedListProps = ComponentPropsWithoutRef<"ul"> & {
  /** Element for the list itself. Defaults to `ul`. */
  as?: ListTag;
};

/**
 * A list whose rows animate in, out and into their new place. Children must be
 * keyed `<AnimatedItem>`s. Rows present on first render do not animate; rows
 * that arrive later (a new ticket, a reply, a search result) fade in, and a
 * removed row fades out while the rest glide up instead of jumping.
 */
export function AnimatedList({ as = "ul", children, ...rest }: AnimatedListProps) {
  const Tag = as as "ul";
  return (
    <MotionScope features="layout">
      <Tag {...rest}>
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </Tag>
    </MotionScope>
  );
}

type ItemTag = "li" | "div" | "article";

export type AnimatedItemProps = PassThrough<"li"> & {
  children?: ReactNode;
  /** Element for the row. Defaults to `li`. */
  as?: ItemTag;
};

/**
 * One row of an `AnimatedList`. Give it a stable `key` (the record id, never
 * the index) — that is how a removed row is told apart from a moved one.
 */
export function AnimatedItem({ as = "li", children, ...rest }: AnimatedItemProps) {
  const Tag = m[as] as typeof m.li;
  return (
    <Tag
      {...rest}
      // Position only: a row that changes HEIGHT (an expanded detail) would
      // otherwise be scale-distorted for the length of the animation.
      layout="position"
      initial={listItem.enter}
      animate={listItem.shown}
      exit={listItem.exit}
      transition={{ layout: spring }}
    >
      {children}
    </Tag>
  );
}

/**
 * Groups whose indicator has already mounted once on this page. The indicator
 * is rendered inside the ACTIVE tab, so switching tabs mounts a new instance —
 * an instance cannot tell "page load" from "the user picked me". The first
 * mount per group is the page load; every later one is a change.
 */
const mountedTabGroups = new Set<string>();

export interface TabIndicatorProps {
  /**
   * Names the tab strip. Two strips on one page need two names, or the
   * indicator would glide from one strip to the other.
   */
  group: string;
  className?: string;
}

/**
 * The underline under the active tab, gliding to the next one on change.
 * Render it INSIDE the active tab only; the tab needs `position: relative`
 * (`.tds-tab-indicator` does the rest). Purely decorative — the tab's
 * `aria-selected` is still what carries the state.
 */
export function TabIndicator({ group, className }: TabIndicatorProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  // Phones: a tab strip wider than the screen scrolls sideways, and the tab
  // the user just picked can sit half outside it. Centre it — but only after a
  // CHANGE (never on page load, which would scroll a strip nobody touched) and
  // only by scrolling the strip itself, never the page: `scrollIntoView` would
  // also move the document vertically if the strip is near an edge.
  useEffect(() => {
    if (!mountedTabGroups.has(group)) {
      mountedTabGroups.add(group);
      return;
    }
    const tab = ref.current?.parentElement;
    const strip = tab?.parentElement;
    if (!tab || !strip || strip.scrollWidth <= strip.clientWidth) return;
    const t = tab.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    strip.scrollBy({
      left: t.left + t.width / 2 - (s.left + s.width / 2),
      behavior: reduce ? "instant" : "smooth",
    });
  }, [group, reduce]);

  return (
    <MotionScope features="layout">
      <m.span
        ref={ref}
        aria-hidden="true"
        layoutId={`tds-tab-indicator-${group}`}
        className={className ? `tds-tab-indicator ${className}` : "tds-tab-indicator"}
        initial={false}
        transition={spring}
      />
    </MotionScope>
  );
}

export interface CollapseProps extends PassThrough<"div"> {
  /** Whether the content is shown. */
  open: boolean;
  children: ReactNode;
}

/**
 * Inline content that opens and closes: a form error, an "advanced" block, a
 * reply composer. Height is the one non-composited property in this layer, so
 * it is kept to small inline blocks and switched off entirely under reduced
 * motion (`MotionConfig` only drops transforms, not size).
 */
export function Collapse({ open, children, style, ...rest }: CollapseProps) {
  const reduce = useReducedMotion();
  const instant = { duration: 0 };
  return (
    <MotionScope>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div
            key="collapse"
            {...rest}
            style={{ overflow: "hidden", ...style }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: reduce ? instant : transitions.base }}
            exit={{ height: 0, opacity: 0, transition: reduce ? instant : transitions.fast }}
          >
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </MotionScope>
  );
}

/**
 * `true` where the primary pointer is a finger. SSR-safe: `false` on the
 * server and on the first client render (so hydration matches), then the real
 * answer. Branch on the POINTER, not the width — a small desktop window has a
 * mouse, a large tablet does not. Same rule as ThemeToggle.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    // Absent in jsdom and some embedded webviews: stay on the mouse default.
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(pointer: coarse)");
    setCoarse(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return coarse;
}

/**
 * The last non-empty value of `value`. For content that must keep showing its
 * text while it animates OUT — a closing `Collapse` whose message was just
 * cleared would otherwise shrink an empty box.
 */
export function useLastDefined<T>(value: T | null | undefined): T | null | undefined {
  const last = useRef(value);
  if (value !== null && value !== undefined && value !== "") last.current = value;
  return value !== null && value !== undefined && value !== "" ? value : last.current;
}

export { AnimatePresence, m };
