import { z } from "zod";

/**
 * The free blocks of a business-card page — the contract shared by the panel
 * editor (`tds-ext-cards-pkg/islands/BlockList.tsx`) and the public renderer
 * (`tds-card-frontend/src/components/CardPage.astro`).
 *
 * A card has two halves. The FIXED fields (name, role, phone, e-mail, address,
 * colours) are columns on `card_page`, because a vCard and a JSON-LD `Person`
 * need them by name and a free-form block cannot supply either. Everything the
 * card's owner wants to add beyond that — a list of links, a line of prose,
 * opening hours — lives here, as an ordered list of typed blocks stored as JSON
 * in `card_page.blocks`.
 *
 * It lives in this package rather than in the extension for one reason: the
 * editor and the renderer are in different repositories and will be released
 * separately, so a model defined in either of them would drift. The PHP half
 * validates the shape too (`Support\CardBlocks`), hand-mirrored the same way
 * `BlogPostCreateSchema` is.
 *
 * Text is NOT `.min()`d: a block that was just inserted is still empty while
 * the author is typing, and a schema that rejects it makes the editor unable to
 * save a draft. Emptiness is the renderer's problem, and it drops empties.
 */

/* --- links --------------------------------------------------------------- */

/**
 * Schemes a card may link to.
 *
 * The allow-list is the whole point. `javascript:` and `data:` in an `href` are
 * a stored cross-site script the moment an editor pastes one, and this page is
 * rendered on a customer's own domain where nobody is watching. A relative link
 * is rejected as well — a card is a single page, so a relative target is always
 * a mistake, and permitting it would also permit `//evil.example`, which a
 * browser reads as an absolute URL.
 */
const ALLOWED_SCHEMES = ["http:", "https:", "mailto:", "tel:"] as const;

/** Whether a string is a link a card may render. Mirrors `CardBlocks::hrefOk`. */
export function isSafeHref(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  return (ALLOWED_SCHEMES as readonly string[]).includes(url.protocol);
}

/**
 * An `href` the editor may store: empty, or safe.
 *
 * Empty passes for the same reason text is not `.min()`d — a link the author
 * has only just inserted has no target yet, and a schema that rejects it makes
 * the whole card unsavable while they work. An empty target never reaches a
 * page: `cardBlockHasContent` drops the block and the renderer drops the row.
 * Anything non-empty must be one of the four allowed schemes.
 */
const SafeHref = z
  .string()
  .max(600)
  .refine((v) => v.trim() === "" || isSafeHref(v), { message: "href" });

const LinkItem = z.object({
  label: z.string().max(120),
  href: SafeHref,
  /** One short line under the label, e.g. "Mo–Fr, 8–17 Uhr". */
  note: z.string().max(160).optional().nullable(),
  /**
   * Which glyph the renderer draws. A closed vocabulary, not a free string:
   * an icon name the renderer does not know renders as nothing at all, and the
   * editor should not be able to produce that state.
   */
  icon: z
    .enum(["link", "phone", "mail", "map", "calendar", "download", "shop", "chat"])
    .optional()
    .nullable(),
});

export type CardLinkItem = z.infer<typeof LinkItem>;

const LinksBlock = z.object({
  type: z.literal("links"),
  /** Optional heading above the group. */
  label: z.string().max(120).optional().nullable(),
  items: z.array(LinkItem).max(30),
});

/* --- text ---------------------------------------------------------------- */

const HeadingBlock = z.object({
  type: z.literal("heading"),
  text: z.string().max(160),
});

const TextBlock = z.object({
  type: z.literal("text"),
  text: z.string().max(2000),
});

const DividerBlock = z.object({
  type: z.literal("divider"),
});

/* --- hours --------------------------------------------------------------- */

const HoursRow = z.object({
  /** "Mo–Do" — free text, because business reality does not fit an enum. */
  days: z.string().max(60),
  /** "08:00–17:00" or "geschlossen". */
  time: z.string().max(60),
});

const HoursBlock = z.object({
  type: z.literal("hours"),
  label: z.string().max(120).optional().nullable(),
  rows: z.array(HoursRow).max(14),
});

/* --- socials ------------------------------------------------------------- */

/**
 * The networks a card can show.
 *
 * Closed for the same reason `icon` is: the renderer draws a mark per network,
 * and an unknown name draws nothing. Adding one is a change here plus a glyph
 * in the renderer — deliberately two steps, so the two never disagree.
 */
export const CARD_NETWORKS = [
  "linkedin",
  "xing",
  "instagram",
  "facebook",
  "youtube",
  "github",
  "whatsapp",
  "website",
] as const;

const SocialItem = z.object({
  network: z.enum(CARD_NETWORKS),
  href: SafeHref,
});

const SocialsBlock = z.object({
  type: z.literal("socials"),
  items: z.array(SocialItem).max(12),
});

/* --- the union ----------------------------------------------------------- */

export const CardBlockSchema = z.discriminatedUnion("type", [
  LinksBlock,
  HeadingBlock,
  TextBlock,
  HoursBlock,
  SocialsBlock,
  DividerBlock,
]);

export type CardBlock = z.infer<typeof CardBlockSchema>;
export type CardBlockType = CardBlock["type"];

export const CardDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(CardBlockSchema).max(60),
});

export type CardDocument = z.infer<typeof CardDocumentSchema>;

/** A fresh card's blocks: one empty link group, which is what a card is. */
export function emptyCardDocument(): CardDocument {
  return { version: 1, blocks: [{ type: "links", label: null, items: [] }] };
}

/**
 * Parse stored JSON into blocks, dropping whatever does not validate.
 *
 * Fail-soft per block, on purpose and unlike a plain `CardDocumentSchema.parse`.
 * This runs while rendering a live page on a customer's own domain: one block
 * whose `href` an editor broke must cost that block, never the card. The same
 * reasoning as every content fetch on these sites being fail-soft — except here
 * the loss is visible and bounded instead of silent.
 *
 * Accepts either the wrapped document (`{version, blocks}`) or a bare array, so
 * a hand-written row and a panel-written row both render.
 */
export function parseCardDocument(raw: string | null | undefined): CardBlock[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { blocks?: unknown }).blocks)
      ? (parsed as { blocks: unknown[] }).blocks
      : null;
  if (!list) return [];

  const blocks: CardBlock[] = [];
  for (const candidate of list.slice(0, 60)) {
    const result = CardBlockSchema.safeParse(candidate);
    if (result.success) blocks.push(result.data);
  }
  return blocks;
}

/**
 * Whether a block has anything to show.
 *
 * The editor stores empty blocks so a half-finished card can be saved; the
 * renderer must not print an empty heading or a link group with no links.
 */
export function cardBlockHasContent(block: CardBlock): boolean {
  switch (block.type) {
    case "links":
    case "socials":
      return block.items.some((i) => i.href.trim() !== "");
    case "hours":
      return block.rows.some((r) => r.days.trim() !== "" || r.time.trim() !== "");
    case "heading":
    case "text":
      return block.text.trim() !== "";
    case "divider":
      return true;
  }
}

/* --- editor catalog ------------------------------------------------------ */

/** One entry in the panel's "block hinzufügen" menu. */
export interface CardBlockCatalogItem {
  id: CardBlockType;
  label: string;
  hint: string;
  block: CardBlock;
}

export const CARD_BLOCK_CATALOG: readonly CardBlockCatalogItem[] = [
  {
    id: "links",
    label: "Linkgruppe",
    hint: "Beschriftete Links untereinander.",
    block: { type: "links", label: null, items: [{ label: "", href: "", icon: "link" }] },
  },
  {
    id: "heading",
    label: "Überschrift",
    hint: "Trennt zwei Bereiche der Karte.",
    block: { type: "heading", text: "" },
  },
  {
    id: "text",
    label: "Text",
    hint: "Ein kurzer Absatz.",
    block: { type: "text", text: "" },
  },
  {
    id: "hours",
    label: "Öffnungszeiten",
    hint: "Tage und Zeiten als Tabelle.",
    block: { type: "hours", label: null, rows: [{ days: "", time: "" }] },
  },
  {
    id: "socials",
    label: "Profile",
    hint: "Symbole für Netzwerke.",
    block: { type: "socials", items: [{ network: "linkedin", href: "" }] },
  },
  {
    id: "divider",
    label: "Trennlinie",
    hint: "Nur eine Linie.",
    block: { type: "divider" },
  },
];
