import { useEffect, useState } from "react";

export interface FormAlertProps {
  /**
   * The error text to show. When `null`/`undefined`/empty the component
   * renders nothing, so callers can mount it unconditionally and just flip
   * the message.
   */
  message?: string | null;
}

type MotionReact = typeof import("../motion/react");

/**
 * `Collapse` from `../motion/react`, fetched the first time there is
 * something to show.
 *
 * An `import()`, never a static import: this component sits in the
 * `./components` barrel, which Astro hydrates as a whole namespace, so a
 * static `motion` import here would ship the animation runtime to every page
 * that hydrates anything from that barrel (see `toastMotion.tsx`).
 *
 * And not on mount either: a login form mounts an alert that most visitors
 * never see, and fetching an animation runtime for it on every page view is
 * the cost this avoids. The FIRST message therefore appears without motion;
 * every later open and close animates. `null` on the server and the first
 * client render, so hydration matches.
 */
function useCollapse(wanted: boolean): MotionReact["Collapse"] | null {
  const [collapse, setCollapse] = useState<MotionReact["Collapse"] | null>(null);
  useEffect(() => {
    if (!wanted || collapse) return;
    let live = true;
    void import("../motion/react").then((loaded) => {
      if (live) setCollapse(() => loaded.Collapse);
    });
    return () => {
      live = false;
    };
  }, [wanted, collapse]);
  return collapse;
}

/**
 * Inline form error banner. Styled by the `.form-alert` class in
 * `@tracht-digital-solutions/tds-shared/styles/primitives.css`, which renders it in
 * the semantic `--color-danger` token (not the brand accent) with a leading
 * warning icon and a tinted panel — so a failed submit is unmistakably a
 * failure in both light and dark themes. `role="alert"` + `aria-live` make
 * it announce to screen readers when it appears.
 *
 * Once the motion primitives have loaded, it opens and closes with
 * `Collapse`, so the form below slides instead of jumping; while it closes,
 * AnimatePresence keeps the last rendered banner — message included — on
 * screen (aria-hidden and inert). Before that, it simply appears.
 */
export default function FormAlert({ message }: FormAlertProps) {
  const Collapse = useCollapse(Boolean(message));
  const alert = message ? (
    <p className="form-alert" role="alert" aria-live="assertive">
      <svg
        className="form-alert__icon"
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 4a.9.9 0 01.9.9v4.4a.9.9 0 01-1.8 0V6.9A.9.9 0 0110 6zm0 8.4a1.1 1.1 0 100-2.2 1.1 1.1 0 000 2.2z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </p>
  ) : null;
  if (!Collapse) return alert;
  return <Collapse open={Boolean(message)}>{alert}</Collapse>;
}
