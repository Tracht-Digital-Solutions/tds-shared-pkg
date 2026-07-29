import { useEffect, useId, useRef } from "react";
import Spinner from "./Spinner";

export interface ConfirmDialogProps {
  /** Whether the dialog is shown. Drive this from the caller's pending state. */
  open: boolean;
  /** Short question, e.g. `Nutzer wirklich löschen?`. */
  title: string;
  /** Optional consequence line — what the user cannot undo. */
  message?: string | null;
  /** Label of the affirmative button. */
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * `true` (the default) styles the affirmative button as `.btn-danger` and
   * keeps initial focus on *cancel*, so a stray Enter cannot destroy anything.
   * Set `false` for a benign confirmation.
   */
  destructive?: boolean;
  /** Disables both buttons and shows a spinner while the action runs. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation dialog — the replacement for `window.confirm()`.
 *
 * Built on the native `<dialog>` element and opened with `showModal()`, which
 * is what makes this an accessibility improvement rather than a reskin: the
 * browser supplies the focus trap, `Escape`-to-dismiss, `inert` background,
 * focus restoration to the trigger, and top-layer stacking (so no z-index can
 * bury it). Hand-rolled div overlays get every one of those wrong by default.
 *
 * Styled by `.tds-modal*` in
 * `@tracht-digital-solutions/tds-shared/styles/primitives.css`, including a
 * `::backdrop` rule — so it inherits the surface's card geometry and needs no
 * per-app CSS.
 *
 * Deliberately **controlled**: it renders nothing until `open`, and the caller
 * owns the pending item. That keeps the call site's flow explicit —
 *
 * ```tsx
 * const [pending, setPending] = useState<User | null>(null);
 * // …
 * <ConfirmDialog
 *   open={pending !== null}
 *   title={`Nutzer „${pending?.name}“ wirklich löschen?`}
 *   onConfirm={remove}
 *   onCancel={() => setPending(null)}
 * />
 * ```
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  // Keep the DOM's modal state in sync with the `open` prop. showModal() throws
  // if the dialog is already open, and close() on a closed dialog is a no-op, so
  // both are guarded on the live `.open` property rather than on prev-props.
  //
  // `showModal` is feature-detected, and NOT only for tests (jsdom ≤25 has no
  // <dialog> methods at all). A bare `<dialog>` without the `open` attribute is
  // `display: none`, so if the method were missing and we simply called it, the
  // dialog would silently never appear — and since this gates destructive
  // actions, the action would become unreachable rather than merely ugly.
  // The fallback sets the attribute directly: non-modal (no focus trap, no
  // backdrop) but visible and operable.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
      // Focus is set here, imperatively, and NOT with React's `autoFocus`
      // prop: React does not render `autoFocus` as an HTML attribute (it
      // focuses on mount instead), so `showModal()`'s own focusing steps run
      // afterwards, find no `[autofocus]`, and settle on the first focusable
      // element — which would put focus on Cancel even when we asked for
      // Confirm. Focusing after the open call is the only order that wins.
      const target = destructive ? cancelRef.current : confirmRef.current;
      target?.focus();
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open, destructive]);

  // `Escape` fires `cancel` natively. Prevent the default close so React stays
  // the single source of truth for `open` — otherwise the DOM would be shut
  // while the caller still thinks the dialog is up.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeCancel = (e: Event) => {
      e.preventDefault();
      if (!busy) onCancel();
    };
    el.addEventListener("cancel", onNativeCancel);
    return () => el.removeEventListener("cancel", onNativeCancel);
  }, [busy, onCancel]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="tds-modal"
      aria-labelledby={titleId}
      aria-describedby={message ? descId : undefined}
      // A click on the ::backdrop targets the <dialog> itself; a click inside
      // the panel targets a descendant. Comparing target to currentTarget is
      // what distinguishes them.
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="tds-modal__panel">
        <h2 className="tds-modal__title" id={titleId}>
          {title}
        </h2>
        {message ? (
          <p className="marginalia" id={descId}>
            {message}
          </p>
        ) : null}
        <div className="tds-modal__actions">
          {/* Cancel comes first in DOM order so that a platform which ignores
              our explicit focus call still lands on the safe action. */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={busy}
            ref={cancelRef}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={busy}
            ref={confirmRef}
          >
            {busy ? <Spinner size="sm" /> : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
