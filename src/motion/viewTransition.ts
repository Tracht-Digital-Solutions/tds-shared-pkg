/**
 * `transitionUpdate` — animate a DOM update with the browser's own View
 * Transitions, no animation library.
 *
 * For an island that must not pay for `motion` on its first load — a public
 * page's `client:load` list (the blog index, a cart, a login step). Elements
 * that should glide from their old place to their new one carry
 * `class="tds-vt-item"` and a unique `--tds-vt-name` (a CSS ident, e.g.
 * `post-${slug}`); entering ones fade in, leaving ones fade out, the rest of
 * the page does not move.
 *
 * The names are only live WHILE the transition runs (`.tds-vt-list` on
 * `<html>`, set here and removed when it finishes). Named permanently, the same
 * cards would also take part in every cross-page transition
 * (`page-transitions.css`) and morph between unrelated pages.
 *
 * Falls back to a plain update — same final DOM, no animation — where the API
 * is missing, where it does not take the options object (Chrome < 125), and
 * under `prefers-reduced-motion: reduce`. A React caller must commit
 * synchronously inside `update` (`flushSync`), or the browser snapshots the
 * old state twice.
 */

interface ViewTransitionLike {
  finished: Promise<void>;
}
type StartViewTransition = (
  arg: (() => void) | { update: () => void; types?: string[] },
) => ViewTransitionLike;

/** The class on `<html>` that makes `.tds-vt-item` names live. */
export const VIEW_TRANSITION_SCOPE = "tds-vt-list";

export function transitionUpdate(update: () => void, types: string[] = ["list"]): void {
  if (typeof document === "undefined") {
    update();
    return;
  }
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduce =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof start !== "function" || reduce) {
    update();
    return;
  }

  const root = document.documentElement;
  root.classList.add(VIEW_TRANSITION_SCOPE);
  let transition: ViewTransitionLike;
  try {
    transition = start.call(document, { update, types });
  } catch {
    // Chrome 111–124 only takes a callback: no types, but the same animation.
    transition = start.call(document, update);
  }
  void transition.finished.finally(() => root.classList.remove(VIEW_TRANSITION_SCOPE));
}
