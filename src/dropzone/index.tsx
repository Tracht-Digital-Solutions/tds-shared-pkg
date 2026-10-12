import { useEffect, useId, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";

/**
 * The file drop zone every tool that takes files renders.
 *
 * One component instead of a `<input type="file">` per tool: the pick
 * dialog, drag and drop, paste and the animation behave the same in every
 * tool, and a fix lands everywhere at once. Styling is `.tds-dropzone` in
 * `styles/primitives.css`; this module only sets its state attributes.
 *
 * Its own entry point (`./dropzone`) rather than a re-export from
 * `./components`: a tool island imports exactly this and nothing else.
 */
export interface FileDropZoneProps {
  /** Visible call to action and the input's accessible name ("Bilder auswählen"). */
  label: string;
  /** Second line, e.g. "oder hierher ziehen · PDF, max. 50 MB". */
  hint?: string;
  /** Replaces the label while files hover over the zone ("Loslassen zum Hinzufügen"). */
  activeLabel?: string;
  /** Same syntax as the input's `accept`; dropped and pasted files are filtered by it too. */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Also take files pasted anywhere on the page (Ctrl+V of a screenshot). */
  paste?: boolean;
  /** Accepted files, in the order given. With `multiple` off, at most one. */
  onFiles: (files: File[]) => void;
  /** Files that did not match `accept`. Without a handler they are dropped silently. */
  onReject?: (files: File[]) => void;
  /** Extra class on the zone. */
  className?: string;
  /**
   * Text rendered inside the zone, below the hint (a size limit, "3 Dateien
   * gewählt"). It sits inside the zone's `<label>`, so never pass a control.
   */
  children?: ReactNode;
}

/**
 * Whether `file` matches an `accept` string: MIME types (`application/pdf`),
 * wildcards (`image/*`) and extensions (`.pdf`), case-insensitive. An empty
 * accept takes everything — exactly what the native input does.
 */
export function matchesAccept(file: Pick<File, "name" | "type">, accept?: string): boolean {
  const tokens = (accept ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const type = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith(".")) return name.endsWith(t);
    if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

/** Split files into accepted and rejected, honouring `multiple`. */
export function partitionFiles(
  files: File[],
  accept?: string,
  multiple = false,
): { accepted: File[]; rejected: File[] } {
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const f of files) (matchesAccept(f, accept) ? accepted : rejected).push(f);
  return { accepted: multiple ? accepted : accepted.slice(0, 1), rejected };
}

/** True when a drag carries files (not text or a link dragged from the page). */
function carriesFiles(e: DragEvent | ReactDragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

function UploadIcon() {
  return (
    <svg
      className="tds-dropzone__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** "a.pdf", "a.pdf, b.pdf", "a.pdf, b.pdf, c.pdf +2". Names need no translation. */
function summarise(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}

export function FileDropZone({
  label,
  hint,
  activeLabel,
  accept,
  multiple = false,
  disabled = false,
  paste = false,
  onFiles,
  onReject,
  className,
  children,
}: FileDropZoneProps) {
  const [over, setOver] = useState(false);
  const [pageDrag, setPageDrag] = useState(false);
  const [dropped, setDropped] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const hintId = useId();
  const zone = useRef<HTMLDivElement>(null);

  // The latest callbacks without re-binding the document listeners on every
  // render: tools pass inline arrows.
  const latest = useRef({ onFiles, onReject, accept, multiple, disabled });
  latest.current = { onFiles, onReject, accept, multiple, disabled };

  const take = (list: File[]) => {
    const { onFiles: give, onReject: refuse, accept: acc, multiple: many, disabled: off } = latest.current;
    if (off || list.length === 0) return;
    const { accepted, rejected } = partitionFiles(list, acc, many);
    if (rejected.length) refuse?.(rejected);
    if (accepted.length === 0) return;
    setNames(accepted.map((f) => f.name));
    setDropped(true);
    give(accepted);
  };

  /*
   * Page-level drag tracking. `dragenter`/`dragleave` fire for every child
   * crossed, so a counter — not a boolean — says whether files are still over
   * the document. The document also swallows a drop that misses the zone:
   * the browser's default would navigate away to the file and lose the tool.
   */
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth++;
      setPageDrag(true);
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setPageDrag(false);
    };
    const end = () => {
      depth = 0;
      setPageDrag(false);
      setOver(false);
    };
    const overDoc = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const dropDoc = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
      end();
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", overDoc);
    document.addEventListener("drop", dropDoc);
    document.addEventListener("dragend", end);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", overDoc);
      document.removeEventListener("drop", dropDoc);
      document.removeEventListener("dragend", end);
    };
  }, []);

  /* The pop ends on the zone's own `animationend`; the icon animates too and
     its event bubbles here. A native listener rather than `onAnimationEnd`:
     React derives that event's name from vendor-prefix detection, which a
     test DOM without `AnimationEvent` answers differently from a browser. */
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const done = (e: Event) => {
      if (e.target === el) setDropped(false);
    };
    el.addEventListener("animationend", done);
    return () => el.removeEventListener("animationend", done);
  }, []);

  useEffect(() => {
    if (!paste) return;
    const onPaste = (e: ClipboardEvent) => {
      // A paste into a text field is text editing, not a file hand-over.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input:not([type=file]), textarea, [contenteditable]")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      take(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // `take` reads everything it needs through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paste]);

  const classes = ["tds-dropzone", className].filter(Boolean).join(" ");

  return (
    <div
      ref={zone}
      className={classes}
      data-over={over || undefined}
      data-page-drag={(pageDrag && !disabled) || undefined}
      data-dropped={dropped || undefined}
      data-disabled={disabled || undefined}
      onDragEnter={(e) => {
        if (!carriesFiles(e) || disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!carriesFiles(e) || disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!zone.current?.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        setPageDrag(false);
        take(Array.from(e.dataTransfer?.files ?? []));
      }}
    >
      <label className="tds-dropzone__body">
        <UploadIcon />
        <span className="tds-dropzone__title">{over && activeLabel ? activeLabel : label}</span>
        {hint && (
          <span id={hintId} className="tds-dropzone__hint">
            {hint}
          </span>
        )}
        {names.length > 0 && (
          <span className="tds-dropzone__files" aria-live="polite">
            {summarise(names)}
          </span>
        )}
        <input
          type="file"
          className="tds-dropzone__input"
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            take(Array.from(e.target.files ?? []));
            // Picking the same file again must fire `change` again.
            e.target.value = "";
          }}
        />
        {children}
      </label>
    </div>
  );
}
