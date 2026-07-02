export interface FormAlertProps {
  /**
   * The error text to show. When `null`/`undefined`/empty the component
   * renders nothing, so callers can mount it unconditionally and just flip
   * the message.
   */
  message?: string | null;
}

/**
 * Inline form error banner. Styled by the `.form-alert` class in
 * `@tracht-digital-solutions/tds-shared/styles/app.css`, which renders it in
 * the semantic `--color-danger` token (not the brand accent) with a leading
 * warning icon and a tinted panel — so a failed submit is unmistakably a
 * failure in both light and dark themes. `role="alert"` + `aria-live` make
 * it announce to screen readers when it appears.
 */
export default function FormAlert({ message }: FormAlertProps) {
  if (!message) return null;
  return (
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
  );
}
