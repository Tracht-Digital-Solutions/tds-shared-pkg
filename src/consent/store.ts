import {
  CONSENT_VERSION,
  allGranted,
  isConsentCategory,
  necessaryOnly,
  type ConsentCategory,
  type ConsentChoices,
  type ConsentRecord,
} from "./categories";
import { getAdConsent, setAdConsent } from "./adConsent";

/** localStorage key holding the consent record. */
export const CONSENT_KEY = "tds-consent";

/** Window event fired whenever the record changes. `detail` is the new record. */
export const CONSENT_EVENT = "tds:consent-change";

/** Window event that asks any mounted banner to open its settings dialog. */
export const CONSENT_OPEN_EVENT = "tds:consent-open";

/**
 * Read the stored record, or `null` when the visitor has not decided.
 *
 * Four things count as "not decided", and all four have to, because each one
 * would otherwise leave a visitor silently governed by a choice they cannot
 * have made:
 *
 *  1. nothing stored,
 *  2. stored bytes that are not a record (hand-edited, half-written, another
 *     app's key collision),
 *  3. a record written under an older {@link CONSENT_VERSION},
 *  4. storage that throws on read (private mode, blocked site data).
 *
 * Case 4 is why this returns `null` rather than a default-granting record: a
 * browser that cannot remember a decision must be asked, and must have nothing
 * non-essential loaded until it answers.
 */
export function readConsent(): ConsentRecord | null {
  if (typeof window === "undefined") return null;

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }

  if (raw === null) return migrateLegacy();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const record = coerce(parsed);
  if (record === null) return null;
  // A purpose that changed was never consented to — ask again.
  if (record.v !== CONSENT_VERSION) return null;
  return record;
}

/**
 * Carry a pre-existing `tds-ad-consent` choice into the category model, so the
 * blog's returning readers are not asked a second time for something they
 * already answered. Advertising maps to `marketing`; the other two optional
 * categories did not exist when that key was written, so they stay off — an
 * absent answer is a "no", never an assumed "yes".
 *
 * Deliberately NOT written back to `tds-consent`: this is a reading of an old
 * answer, not a new one, and writing it would stamp it with today's date and
 * this version, i.e. manufacture a proof of something that never happened. It
 * is re-derived on every read until the visitor decides for real.
 */
function migrateLegacy(): ConsentRecord | null {
  const legacy = getAdConsent();
  if (legacy === null) return null;
  return {
    v: CONSENT_VERSION,
    ts: null,
    lang: "de",
    choices: { ...necessaryOnly(), marketing: legacy === "granted" },
  };
}

function coerce(value: unknown): ConsentRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.v !== "number") return null;
  if (typeof o.choices !== "object" || o.choices === null) return null;

  const src = o.choices as Record<string, unknown>;
  const choices = necessaryOnly();
  for (const [k, v] of Object.entries(src)) {
    if (isConsentCategory(k) && typeof v === "boolean") choices[k] = v;
  }
  // Necessary is not stored as a decision and is not read back as one.
  choices.necessary = true;

  return {
    v: o.v,
    ts: typeof o.ts === "string" ? o.ts : null,
    lang: typeof o.lang === "string" ? o.lang : "de",
    choices,
  };
}

/**
 * Persist a decision and tell everyone.
 *
 * Also writes the legacy `tds-ad-consent` key from the `marketing` choice.
 * That is not tidy, and it is not going away: the blog's ad loader reads that
 * key and ships on its own release cadence, so dropping the write here would
 * silently stop advertising working on a site this package cannot see. The
 * write is one-way — the category model is the source of truth, the old key is
 * a projection of it.
 */
export function writeConsent(choices: ConsentChoices, lang: string): ConsentRecord {
  const record: ConsentRecord = {
    v: CONSENT_VERSION,
    ts: new Date().toISOString(),
    lang,
    choices: { ...choices, necessary: true },
  };

  if (typeof window === "undefined") return record;

  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    /* private mode — the choice governs this page view and is not remembered */
  }

  // Projection onto the legacy key. `setAdConsent` fires its own event.
  setAdConsent(record.choices.marketing ? "granted" : "denied");

  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: record }));
  } catch {
    /* ignore */
  }

  return record;
}

/** Grant everything. */
export const acceptAll = (lang: string): ConsentRecord => writeConsent(allGranted(), lang);

/** Grant nothing beyond what the site cannot work without. */
export const rejectAll = (lang: string): ConsentRecord => writeConsent(necessaryOnly(), lang);

/**
 * Forget the decision entirely, so the banner asks again. Used by the tests and
 * available to a "reset" control; note that this does NOT retract consent —
 * `rejectAll` does. Forgetting and refusing are different answers.
 */
export function clearConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Has this category been consented to? `necessary` is always true; everything
 * else is false until the visitor says otherwise — including while they are
 * still deciding, which is the whole point of asking first.
 */
export function consentGranted(category: ConsentCategory): boolean {
  if (category === "necessary") return true;
  return readConsent()?.choices[category] === true;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function onConsentChange(fn: (record: ConsentRecord) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ConsentRecord>).detail;
    if (detail) fn(detail);
  };
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

/**
 * Open the settings dialog from anywhere — the footer's "Cookie-Einstellungen"
 * entry, a link inside the privacy policy, a placeholder card in an article.
 *
 * An event rather than a shared React context on purpose: the caller and the
 * banner are separate Astro islands with separate React roots, so there is no
 * common provider to hang state on. The banner listens; if none is mounted the
 * call is a no-op rather than an error.
 */
export function openConsentSettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
  } catch {
    /* ignore */
  }
}
