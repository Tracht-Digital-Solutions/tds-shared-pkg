import type { ReactNode } from "react";

export interface SegmentedProps<T extends string | number> {
  value: T;
  /** `[value, label]` pairs in display order. */
  options: ReadonlyArray<readonly [T, ReactNode]>;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A single-choice row of chips (`role="group"` + `aria-pressed`). For a choice
 * that switches a VIEW use `Tabs`; this is for a setting (format, size, mode).
 *
 * Promoted in 0.59 from the devkit studio, the card designer and the image
 * compressor.
 */
export default function Segmented<T extends string | number>({ value, options, onChange, label, className, disabled }: SegmentedProps<T>) {
  return (
    <div className={`flex flex-wrap gap-2${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          className={value === v ? "chip chip-active" : "chip"}
          aria-pressed={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
