import type { ReactNode } from "react";

export type AlertTone = "danger" | "warning" | "success" | "info";

export interface AlertProps {
  tone?: AlertTone;
  /** Nothing renders for `null`/`undefined`/`false`/`""`, so a call site can mount it unconditionally. */
  children?: ReactNode;
  className?: string;
}

/**
 * The in-flow message block (`.tds-alert`): load failures, validation
 * summaries, empty states, anything to read or copy. Transient outcomes are
 * toasts instead (see `docs/agents/components.md`).
 *
 * `danger` and `warning` announce as `role="alert"`; `success` and `info` are a
 * polite `role="status"`. `.tds-appear` fades it in on insertion where the
 * engine supports `@starting-style`. No motion import — safe in a tool island
 * and in the `./components` barrel.
 *
 * Replaces ~80 hand-written `<p className="tds-alert tds-alert--danger" role="alert">`
 * copies (0.58), several of which had dropped the role.
 */
export default function Alert({ tone = "danger", children, className }: AlertProps) {
  if (children === null || children === undefined || children === false || children === "") return null;
  const urgent = tone === "danger" || tone === "warning";
  return (
    <p
      className={`tds-alert tds-alert--${tone} tds-appear${className ? ` ${className}` : ""}`}
      role={urgent ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
