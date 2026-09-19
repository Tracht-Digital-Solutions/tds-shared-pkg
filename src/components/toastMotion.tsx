/**
 * The animated half of `ToastHost`, loaded on demand.
 *
 * `ToastHost` lives in the `./components` barrel, and Astro hydrates an island
 * by importing its module's whole NAMESPACE — so every public site that mounts
 * a `ThemeToggle` or the chat bubble from that barrel ships everything the
 * barrel imports statically, with no chance to tree-shake it. A static
 * `motion` import there put ~45 KB (gzip) of animation runtime on every
 * public page, most of which never shows a toast. This module is therefore
 * only ever reached through `import()` from `ToastHost`, i.e. only on a page
 * that actually mounts the host (the panels). See the "no static motion in
 * the barrel" contract in `motionReact.test.tsx`.
 */
import { AnimatePresence, m, useIsPresent } from "motion/react";
import type { ReactNode } from "react";
import { spring, transitions } from "../motion";
import { MotionScope } from "../motion/react";

/**
 * A toast rises into place and, when it goes, fades out while the stack below
 * it glides up (`layout="position"`) instead of jumping. Reduced motion drops
 * the movement via `MotionScope`; the opacity step remains, and the end state
 * is always reached.
 */
const TOAST_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, scale: 0.96, transition: transitions.fast },
  transition: { layout: spring },
} as const;

/**
 * Swipe-to-dismiss on touch screens: a toast flicked sideways far enough, or
 * fast enough, is dismissed; anything less springs back. Touch only — with a
 * mouse, a horizontal drag is how people select a toast's text.
 */
const SWIPE_DISTANCE = 80;
const SWIPE_VELOCITY = 500;

export interface AnimatedToastsProps<T extends { id: number }> {
  items: T[];
  /** Touch screens only — see SWIPE_DISTANCE. */
  swipeable: boolean;
  className: (item: T) => string;
  /** The toast's inside (icon, message, close button), shared with the static path. */
  render: (item: T) => ReactNode;
  onDismiss: (id: number) => void;
  /** Pause/resume the host's timers (a finger on the toast is a hover). */
  onHold: (held: boolean) => void;
}

/** One live region's stack, animated. */
export function AnimatedToasts<T extends { id: number }>({ items, ...card }: AnimatedToastsProps<T>) {
  return (
    <MotionScope features="layout">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <ToastCard key={item.id} item={item} {...card} />
        ))}
      </AnimatePresence>
    </MotionScope>
  );
}

/** One toast. A component rather than inline JSX so it can ask Motion whether it is leaving. */
function ToastCard<T extends { id: number }>({
  item,
  swipeable,
  className,
  render,
  onDismiss,
  onHold,
}: Omit<AnimatedToastsProps<T>, "items"> & { item: T }) {
  const isPresent = useIsPresent();
  return (
    <m.div
      layout="position"
      {...TOAST_MOTION}
      // Leaving: out of the accessibility tree and out of the tab order at
      // once, while it is still fading. A dismissed toast must not be read
      // out again, and its close button must not be reachable a second time.
      aria-hidden={isPresent ? undefined : true}
      inert={!isPresent}
      className={className(item)}
      drag={swipeable ? "x" : false}
      dragSnapToOrigin
      dragElastic={0.6}
      // Vertical swipes still scroll the page underneath.
      style={swipeable ? { touchAction: "pan-y" } : undefined}
      // A finger on the toast counts as hovering it: the timer must not
      // dismiss it mid-swipe, then snap the stack under the user's thumb.
      onDragStart={() => onHold(true)}
      onDragEnd={(_event, info) => {
        onHold(false);
        if (Math.abs(info.offset.x) > SWIPE_DISTANCE || Math.abs(info.velocity.x) > SWIPE_VELOCITY) {
          onDismiss(item.id);
        }
      }}
    >
      {render(item)}
    </m.div>
  );
}
