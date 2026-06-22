import { ThemeToggle } from "@tracht-digital-solutions/tds-shared/components";

/**
 * Bare toggle — the icon button as it sits in a nav bar. Shows the moon
 * (light mode → tap to go dark); the icon swaps to a sun once the page is
 * in dark mode. Styling comes from the DS's Tailwind utilities + brand
 * tokens shipped in styles.css.
 */
export function Default() {
  return <ThemeToggle />;
}

/**
 * In situ — the toggle inside a frosted brand header pill, paired with the
 * wordmark, the way every TDS frontend uses it (right-aligned controls).
 */
export function InHeaderBar() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1.5rem",
        padding: "0.5rem 1rem",
        borderRadius: "9999px",
        border: "1px solid var(--color-line)",
        background: "color-mix(in srgb, var(--color-card) 72%, transparent)",
        minWidth: 300,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.25rem",
          lineHeight: 1,
          color: "var(--color-primary)",
        }}
      >
        Tracht <span style={{ fontStyle: "italic", color: "var(--color-accent)" }}>Digital</span>
      </span>
      <ThemeToggle />
    </div>
  );
}
