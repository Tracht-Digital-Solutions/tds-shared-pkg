import type { ReactNode } from "react";

export interface RangeFieldProps {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Shown after the value: `Qualität: 80 %`. */
  unit?: string;
  /** Formats the shown value (e.g. a localised decimal). Default: the number as is. */
  display?: (value: number) => ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled range slider that shows its current value: `label: value unit`.
 * The label wraps the input, so the slider has its accessible name.
 *
 * Promoted in 0.58 from fourteen copies across the pdf, media, office, qr and
 * textkit tool packs.
 */
export default function RangeField({ label, value, onChange, min, max, step = 1, unit, display, disabled, className }: RangeFieldProps) {
  return (
    <label className={`block text-sm${className ? ` ${className}` : ""}`}>
      <span className="mb-1 block opacity-80">
        {label}: {display ? display(value) : value}
        {unit ? ` ${unit}` : ""}
      </span>
      <input
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
