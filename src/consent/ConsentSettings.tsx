import { useEffect, useId, useRef, useState } from "react";
import { translations, type Language } from "../i18n/translations";
import {
  allGranted,
  necessaryOnly,
  type ConsentChoices,
  type OptionalCategory,
} from "./categories";

export interface ConsentSettingsProps {
  open: boolean;
  lang: Language;
  /** The optional categories this site actually uses, in display order. */
  categories: readonly OptionalCategory[];
  /** Starting position of the switches — the stored record, or all-off. */
  initial: ConsentChoices;
  privacyUrl: string;
  imprintUrl?: string;
  onSave: (choices: ConsentChoices) => void;
  onClose: () => void;
}

/**
 * The second consent layer: one switch per purpose.
 *
 * Built on the native `<dialog>` + `showModal()` for the same reason
 * `ConfirmDialog` is — the browser supplies the focus trap, `Escape`, the
 * `inert` background, focus restoration to whatever opened it, and top-layer
 * stacking. Hand-rolled overlays get all five wrong, and here that would not be
 * a polish issue: this dialog is the ONLY route by which a visitor can refuse
 * a purpose after the fact, so a keyboard user who cannot reach or leave it has
 * lost a right, not a convenience.
 *
 * The first layer is deliberately NOT a dialog (see `ConsentBanner`). This one
 * is, because by the time it is open the visitor has asked for it.
 *
 * Every switch starts where the stored record left it, and an undecided
 * visitor starts with every optional purpose OFF. No pre-ticked boxes: an
 * inactive default is not a consent (Art. 4 Nr. 11 DSGVO; BGH I ZR 7/16
 * "Cookie-Einwilligung II").
 */
export default function ConsentSettings({
  open,
  lang,
  categories,
  initial,
  privacyUrl,
  imprintUrl,
  onSave,
  onClose,
}: ConsentSettingsProps) {
  const t = translations[lang].consent;
  const ref = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descId = useId();
  const [choices, setChoices] = useState<ConsentChoices>(initial);

  // Re-seed from the record every time the dialog opens: a visitor who opens
  // settings, flips a switch, then closes without saving must not find their
  // abandoned edit still sitting there on the next open.
  useEffect(() => {
    if (open) setChoices(initial);
  }, [open, initial]);

  // Same guarded, feature-detected open/close as ConfirmDialog. jsdom below
  // v26 has no <dialog> methods, and a bare <dialog> without the `open`
  // attribute is `display: none` — so an unguarded showModal() call would make
  // the settings silently unreachable rather than merely unstyled.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
      // Imperative, after the open call: React does not emit `autoFocus` as an
      // attribute, so showModal()'s own focusing steps would otherwise win.
      //
      // The HEADING takes focus, not a button. showModal() would otherwise
      // settle on the first focusable element and arm it, so a stray Enter
      // would decide something about the visitor's data before they had read
      // a word. Focusing the title announces the dialog and arms nothing.
      titleRef.current?.focus();
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  // Escape fires `cancel` natively. Take it over so React stays the single
  // source of truth for `open` — and treat it as "close", not "save": leaving
  // a consent dialog by Escape must not be read as agreeing to anything.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    el.addEventListener("cancel", onNativeCancel);
    return () => el.removeEventListener("cancel", onNativeCancel);
  }, [onClose]);

  if (!open) return null;

  const rows = ["necessary" as const, ...categories];

  return (
    <dialog
      ref={ref}
      className="tds-modal consent-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tds-modal__panel consent-dialog__panel">
        {/* A visible close, and not only Escape plus a backdrop click. Escape
            does not exist on a touch device and a backdrop click is
            undiscoverable, so without this the only ways out of a dialog about
            someone's data are two nobody can see. Closes WITHOUT saving —
            leaving must never be read as agreeing. */}
        <button
          type="button"
          className="consent-dialog__close"
          aria-label={t.close}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
        <h2 className="tds-modal__title" id={titleId} ref={titleRef} tabIndex={-1}>
          {t.title}
        </h2>
        <p className="consent-dialog__intro" id={descId}>
          {t.intro}
        </p>

        <ul className="consent-dialog__list">
          {rows.map((cat) => {
            const meta = t.categories[cat];
            const locked = cat === "necessary";
            return (
              <li className="consent-row" key={cat}>
                <label className="consent-row__head">
                  <input
                    type="checkbox"
                    className="consent-row__input"
                    checked={locked ? true : choices[cat]}
                    disabled={locked}
                    onChange={(e) =>
                      setChoices((c) => ({ ...c, [cat]: e.target.checked }))
                    }
                  />
                  <span className="consent-row__label">{meta.label}</span>
                  {locked ? <span className="consent-row__badge">{t.alwaysOn}</span> : null}
                </label>
                {/* Description sits OUTSIDE the label on purpose: inside, every
                    screen reader would read the whole paragraph as the
                    checkbox's accessible name on each arrow-key pass. */}
                <p className="consent-row__desc">{meta.description}</p>
              </li>
            );
          })}
        </ul>

        <p className="consent-dialog__links">
          <a href={privacyUrl}>{t.privacy}</a>
          {imprintUrl ? (
            <>
              {" · "}
              <a href={imprintUrl}>{t.imprint}</a>
            </>
          ) : null}
        </p>

        <div className="consent-dialog__actions">
          {/* The two blanket shortcuts are peers and carry the SAME class:
              refusing must be no harder than agreeing (Art. 7 Abs. 3 DSGVO).
              The emphasis goes to "Auswahl speichern" instead — the considered
              action this dialog exists for. Emphasising accept over reject is
              the construction German enforcement keeps finding; emphasising
              neither over the other is the fix. */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onSave(necessaryOnly())}
          >
            {t.necessaryOnly}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => onSave(allGranted())}>
            {t.acceptAll}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(choices)}>
            {t.save}
          </button>
        </div>
      </div>
    </dialog>
  );
}
