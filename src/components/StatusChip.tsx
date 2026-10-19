import { resolveChipVariant, type ChipVariant } from "../design";

/** One status: its label and the chip colour it reads in. */
export interface StatusStyle {
  label: string;
  tone: ChipVariant | string;
}

export interface StatusChipProps {
  status: string;
  /** Per-domain map, e.g. `{ paid: { label: "Bezahlt", tone: "success" } }`. */
  map: Readonly<Record<string, StatusStyle>>;
  className?: string;
}

/** The label of a status, or the raw value when the map does not know it. */
export function statusLabel(map: Readonly<Record<string, StatusStyle>>, status: string): string {
  return map[status]?.label ?? status;
}

/**
 * A status rendered as a chip. The tone goes through `resolveChipVariant`, so
 * an unknown or aliased colour (`muted`, `error`) falls back to a real variant
 * instead of an unstyled class.
 *
 * Promoted in 0.58: projects, billing, referrals and the shop each kept a
 * label + `chip--*` map, one of them with a tone that was not a chip variant.
 */
export default function StatusChip({ status, map, className }: StatusChipProps) {
  const entry = map[status];
  const variant = resolveChipVariant(entry?.tone ?? "neutral");
  return <span className={`chip ${variant}${className ? ` ${className}` : ""}`}>{entry?.label ?? status}</span>;
}
