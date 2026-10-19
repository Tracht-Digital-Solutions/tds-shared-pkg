/**
 * Display formatting shared by every frontend: dates, money and byte sizes.
 *
 * Plain functions, no React, no DOM — server-safe for Astro frontmatter and
 * small enough for a tool island. Before 0.58 each panel extension, tool pack
 * and site carried its own copy, and the copies disagreed: three English
 * locales (en-US, en-GB, en-IE), two time-zone rules for the same SQL column
 * shape, and a euro parser that turned "9,90" into NaN.
 */

/** The two languages the sites publish. Same literal union as `Language` in `./i18n`. */
export type FormatLang = "de" | "en";

/** The one locale per language. English is British everywhere (24-hour clock, day first). */
export function localeOf(lang: FormatLang = "de"): "de-DE" | "en-GB" {
  return lang === "en" ? "en-GB" : "de-DE";
}

export type DateInput = string | number | Date | null | undefined;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses what the APIs send: ISO strings, SQL `YYYY-MM-DD HH:MM:SS`, plain
 * `YYYY-MM-DD`, epoch milliseconds or a `Date`.
 *
 * - The space in an SQL datetime becomes `T` (Safari rejects the space form).
 * - A bare date is a LOCAL calendar day, never UTC midnight — otherwise a
 *   visitor west of UTC reads the day before.
 * - `utc: true` reads a zone-less datetime as UTC (columns written with
 *   `gmdate`/`UTC_TIMESTAMP`); the default reads it as local time, which is
 *   what the Berlin-time columns need.
 *
 * Returns `null` for anything that does not parse.
 */
export function parseDate(value: DateInput, opts: { utc?: boolean } = {}): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = value.trim();
  const day = DATE_ONLY.exec(raw);
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
  let iso = raw.replace(" ", "T");
  if (opts.utc && /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += "Z";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * - `numeric`: 07.10.2026 / 07/10/2026
 * - `medium`: 7. Okt. 2026 / 7 Oct 2026
 * - `long`: 7. Oktober 2026 / 7 October 2026
 */
export type DateStyle = "numeric" | "medium" | "long";

export interface DateFormatOptions {
  lang?: FormatLang;
  style?: DateStyle;
  /** Read a zone-less datetime as UTC (see `parseDate`). */
  utc?: boolean;
  /** Pin the output zone, e.g. `"Europe/Berlin"` for server-rendered pages. */
  timeZone?: string;
  /** Shown for a missing or unparsable value. Default `"—"`. */
  fallback?: string;
}

function dateParts(style: DateStyle): Intl.DateTimeFormatOptions {
  if (style === "numeric") return { day: "2-digit", month: "2-digit", year: "numeric" };
  return { dateStyle: style };
}

/** A calendar day in the visitor's language. */
export function formatDate(value: DateInput, opts: DateFormatOptions = {}): string {
  const d = parseDate(value, opts);
  if (!d) return opts.fallback ?? "—";
  return new Intl.DateTimeFormat(localeOf(opts.lang), {
    ...dateParts(opts.style ?? "numeric"),
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/** A day plus hours and minutes: `07.10.2026, 14:05`. */
export function formatDateTime(value: DateInput, opts: DateFormatOptions = {}): string {
  const d = parseDate(value, opts);
  if (!d) return opts.fallback ?? "—";
  const style = opts.style ?? "numeric";
  const parts: Intl.DateTimeFormatOptions =
    style === "numeric"
      ? { ...dateParts(style), hour: "2-digit", minute: "2-digit" }
      : { dateStyle: style, timeStyle: "short" };
  return new Intl.DateTimeFormat(localeOf(opts.lang), {
    ...parts,
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(d);
}

/**
 * `2026-10-07…` → `07.10.2026` by slicing, without any time-zone round trip.
 * For values that ARE a calendar day (due dates, invoice dates) and must
 * never shift, whatever zone the browser is in.
 */
export function formatIsoDay(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return day ? `${day[3]}.${day[2]}.${day[1]}` : fallback;
}

/**
 * Integer cents as currency: `990` → `9,90 €`. An unknown currency code falls
 * back to `9.90 XYZ` instead of throwing — a bad row must not take a list down.
 * `null`/`undefined` render the fallback (`"—"`).
 */
export function formatCents(
  cents: number | null | undefined,
  opts: { currency?: string; lang?: FormatLang; fallback?: string } = {},
): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return opts.fallback ?? "—";
  const currency = opts.currency ?? "EUR";
  try {
    return new Intl.NumberFormat(localeOf(opts.lang), { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** The shop/product-card signature: `formatPrice(cents, currency, lang)`. */
export function formatPrice(cents: number, currency: string, lang: FormatLang = "de"): string {
  return formatCents(cents, { currency, lang });
}

/**
 * Euros as a person types them → integer cents, or `null`.
 *
 * Accepts `9,90`, `9.90`, `1.250,50`, `1 250,5`, `12 €`. With a comma present,
 * dots are thousands separators; without one, a single dot is the decimal mark.
 * More than two decimals, a negative amount or anything else is `null` —
 * money is never rounded silently. `0` is valid; a caller that needs a positive
 * amount checks for it.
 */
export function parseEuros(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim().replace(/[\s €]/g, "");
  if (s === "") return null;
  const normalised = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalised);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Cents → the editable euro text (`990` → `9,90`), for prefilling a price field. */
export function centsToEuroInput(cents: number | null | undefined, lang: FormatLang = "de"): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  const text = (cents / 100).toFixed(2);
  return lang === "de" ? text.replace(".", ",") : text;
}

/**
 * Human byte size with the language's decimal mark: `512 B`, `12,3 KB`, `4,2 MB`.
 * Binary steps (1 KB = 1024 B), one decimal above bytes.
 */
export function formatBytes(bytes: number, lang: FormatLang = "de", digits = 1): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = Math.max(0, bytes);
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const d = u === 0 ? 0 : digits;
  return `${v.toLocaleString(localeOf(lang), { minimumFractionDigits: d, maximumFractionDigits: d })} ${units[u]}`;
}

/**
 * Trim to a whole word (never mid-word, never ending on dangling punctuation),
 * collapsing whitespace first. An ellipsis is added only when something was
 * cut. For meta descriptions (Google renders ~160 characters) and teasers.
 */
export function clampToWord(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  // -1 for the ellipsis.
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, "");
  return `${head}…`;
}
