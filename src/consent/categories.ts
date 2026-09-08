/**
 * The consent category model.
 *
 * Four categories, because that is the smallest set that still lets a visitor
 * make a MEANINGFUL choice. One toggle ("cookies: yes/no") is not a granular
 * consent and the supervisory authorities say so; a dozen vendor-level
 * switches is a wall nobody reads, which fails the same test from the other
 * side.
 *
 * `necessary` is not a choice and is never presented as one. Storage that a
 * service the visitor explicitly asked for cannot work without is exempt from
 * consent under § 25 Abs. 2 Nr. 2 TDDDG — the theme, the language, the basket
 * and this consent record itself. Rendering it as a switched-on toggle the
 * visitor may not move is honest; rendering it as a switch they CAN move and
 * then ignoring them would not be.
 */

export const CONSENT_CATEGORIES = ["necessary", "functional", "analytics", "marketing"] as const;

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** The categories a visitor may actually decide. `necessary` is not among them. */
export const OPTIONAL_CATEGORIES = ["functional", "analytics", "marketing"] as const;

export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number];

export type ConsentChoices = Record<ConsentCategory, boolean>;

/**
 * Schema version of a stored record.
 *
 * Bump this whenever the MEANING of a stored choice changes — a new category,
 * a category that starts covering a new recipient, a reworded purpose. A
 * record from an older version is treated as undecided and the banner asks
 * again, which is the point: consent is given to a specific purpose, so a
 * purpose that changed was never consented to. Do NOT bump it for cosmetic
 * copy edits; asking again for no reason trains people to click the first
 * button.
 */
export const CONSENT_VERSION = 1;

/**
 * What gets stored. `ts` is the proof of WHEN — Art. 7 Abs. 1 DSGVO puts the
 * burden of demonstrating a consent on us, and a boolean without a time and a
 * version demonstrates nothing.
 *
 * `ts` is `null` in exactly one case: a record carried over from the earlier
 * `tds-ad-consent` key, whose original timestamp was never recorded. Inventing
 * one would be fabricating evidence, so it stays null and reads as "decided,
 * time unknown".
 */
export interface ConsentRecord {
  v: number;
  ts: string | null;
  lang: string;
  choices: ConsentChoices;
}

/** Every optional category off. The state a "Nur notwendige" click produces. */
export const necessaryOnly = (): ConsentChoices => ({
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
});

/** Every category on. The state an "Alle akzeptieren" click produces. */
export const allGranted = (): ConsentChoices => ({
  necessary: true,
  functional: true,
  analytics: true,
  marketing: true,
});

/** Narrowing helper for values arriving from storage or a query string. */
export const isConsentCategory = (v: unknown): v is ConsentCategory =>
  typeof v === "string" && (CONSENT_CATEGORIES as readonly string[]).includes(v);
