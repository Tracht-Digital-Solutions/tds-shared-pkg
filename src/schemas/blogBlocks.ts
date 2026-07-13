import { z } from "zod";

/**
 * Block-based blog document model — the source of truth shared by the
 * tds-admin block editor (build + validate), tds-content-api (a hand-mirrored
 * PHP validator), and tds-blog (build-time renderer).
 *
 * A post's `body` is EITHER a markdown string (legacy, `bodyFormat="markdown"`)
 * OR a JSON `BlogDocument` string (`bodyFormat="blocks"`). We never migrate old
 * markdown posts; the format flag switches the editor + renderer.
 *
 * Text fields (`paragraph.text`, `heading.text`, `quote.text`, `callout.text`,
 * `button.label`, `list.items[]`) carry **inline markdown** (bold / italic /
 * link / inline-code) so the editor gets live inline formatting and the
 * renderer can reuse `marked` for the inline pass. Block text is NOT `.min()`d
 * so an empty just-inserted block still validates while editing — the API's
 * document-level check enforces that the post has real content.
 */

/* --- individual block schemas ------------------------------------------- */

const HeadingBlock = z.object({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3)]),
  text: z.string().max(300),
});

const ParagraphBlock = z.object({
  type: z.literal("paragraph"),
  text: z.string().max(5000),
});

const ListBlock = z.object({
  type: z.literal("list"),
  ordered: z.boolean(),
  items: z.array(z.string().max(2000)).max(100),
});

const QuoteBlock = z.object({
  type: z.literal("quote"),
  text: z.string().max(2000),
  cite: z.string().max(200).optional().nullable(),
});

const CodeBlock = z.object({
  type: z.literal("code"),
  lang: z.string().max(30),
  code: z.string().max(20000),
});

const ImageBlock = z.object({
  type: z.literal("image"),
  url: z.string().max(600),
  alt: z.string().max(300),
  caption: z.string().max(300).optional().nullable(),
});

const DividerBlock = z.object({
  type: z.literal("divider"),
});

const CalloutBlock = z.object({
  type: z.literal("callout"),
  variant: z.enum(["info", "warn", "tip"]),
  text: z.string().max(3000),
});

const ButtonBlock = z.object({
  type: z.literal("button"),
  label: z.string().max(120),
  href: z.string().max(600),
  style: z.enum(["primary", "ghost"]),
});

const VideoBlock = z.object({
  type: z.literal("video"),
  provider: z.enum(["youtube", "vimeo"]),
  url: z.string().max(600),
});

/**
 * A Google AdSense unit placed inline in the article body. Renders against the
 * existing global `ads` content block + `AdSlot.astro`; only active when the
 * ads integration is configured. `slot` optionally overrides the ad-unit id.
 */
const AdsenseBlock = z.object({
  type: z.literal("adsense"),
  placement: z.literal("inline"),
  slot: z.string().max(60).optional().nullable(),
});

/** Reference to an admin-defined reusable custom building block (`content_snippet`). */
const CustomBlock = z.object({
  type: z.literal("custom"),
  snippetId: z.number().int().positive(),
});

export const BlogBlockSchema = z.discriminatedUnion("type", [
  HeadingBlock,
  ParagraphBlock,
  ListBlock,
  QuoteBlock,
  CodeBlock,
  ImageBlock,
  DividerBlock,
  CalloutBlock,
  ButtonBlock,
  VideoBlock,
  AdsenseBlock,
  CustomBlock,
]);

export type BlogBlock = z.infer<typeof BlogBlockSchema>;
export type BlogBlockType = BlogBlock["type"];

/**
 * The full block document stored in `blog_post.body` when `bodyFormat="blocks"`.
 * `version` lets the renderer migrate older shapes if the model ever changes.
 */
export const BlogDocumentSchema = z.object({
  version: z.literal(1),
  blocks: z.array(BlogBlockSchema).min(1).max(400),
});

export type BlogDocument = z.infer<typeof BlogDocumentSchema>;

/** An empty starter document for a fresh block-editor post. */
export function emptyBlogDocument(): BlogDocument {
  return { version: 1, blocks: [{ type: "paragraph", text: "" }] };
}

/* --- slash-menu catalog -------------------------------------------------- */

/**
 * One entry in the block "slash menu" (`/` command palette). `block` is the
 * template inserted when the command is picked (the editor clones it).
 * `integration` gates a command behind a configured third-party integration —
 * e.g. AdSense only appears/enables when the ads integration is set up.
 *
 * Admin-defined custom blocks (`type: "custom"`) are NOT in this static
 * catalog; the editor appends them from the `content_snippet` API.
 */
export interface BlockCatalogItem {
  /** Unique command id (also the slash-menu filter key), e.g. "heading-2". */
  id: string;
  /** German label shown in the menu. */
  label: string;
  /** Extra search terms the fuzzy filter matches against. */
  keywords: string[];
  /** Short glyph / emoji shown left of the label. */
  icon: string;
  group: "text" | "media" | "embed";
  /** Gate: the command is only usable when this integration is configured. */
  integration?: "ads";
  /** The block inserted when this command is chosen (with default values). */
  block: BlogBlock;
}

export const BLOG_BLOCKS: BlockCatalogItem[] = [
  {
    id: "text",
    label: "Text",
    keywords: ["absatz", "paragraph", "p"],
    icon: "¶",
    group: "text",
    block: { type: "paragraph", text: "" },
  },
  {
    id: "heading-2",
    label: "Überschrift 2",
    keywords: ["h2", "titel", "kapitel", "abschnitt", "heading"],
    icon: "H2",
    group: "text",
    block: { type: "heading", level: 2, text: "" },
  },
  {
    id: "heading-3",
    label: "Überschrift 3",
    keywords: ["h3", "untertitel", "heading"],
    icon: "H3",
    group: "text",
    block: { type: "heading", level: 3, text: "" },
  },
  {
    id: "list-bulleted",
    label: "Aufzählung",
    keywords: ["liste", "bullet", "punkte", "ul"],
    icon: "•",
    group: "text",
    block: { type: "list", ordered: false, items: [""] },
  },
  {
    id: "list-numbered",
    label: "Nummerierte Liste",
    keywords: ["liste", "ordered", "ol", "zahlen"],
    icon: "1.",
    group: "text",
    block: { type: "list", ordered: true, items: [""] },
  },
  {
    id: "quote",
    label: "Zitat",
    keywords: ["blockquote", "zitieren"],
    icon: "❝",
    group: "text",
    block: { type: "quote", text: "", cite: null },
  },
  {
    id: "code",
    label: "Code",
    keywords: ["snippet", "pre", "programm"],
    icon: "</>",
    group: "text",
    block: { type: "code", lang: "text", code: "" },
  },
  {
    id: "divider",
    label: "Trennlinie",
    keywords: ["hr", "linie", "trenner", "separator"],
    icon: "―",
    group: "text",
    block: { type: "divider" },
  },
  {
    id: "image",
    label: "Bild",
    keywords: ["foto", "grafik", "img", "media"],
    icon: "🖼",
    group: "media",
    block: { type: "image", url: "", alt: "", caption: null },
  },
  {
    id: "video",
    label: "Video",
    keywords: ["youtube", "vimeo", "embed", "film"],
    icon: "▶",
    group: "media",
    block: { type: "video", provider: "youtube", url: "" },
  },
  {
    id: "callout",
    label: "Hinweisbox",
    keywords: ["callout", "info", "warnung", "tipp", "note"],
    icon: "💡",
    group: "media",
    block: { type: "callout", variant: "info", text: "" },
  },
  {
    id: "button",
    label: "Button / CTA",
    keywords: ["cta", "link", "aktion", "schaltfläche"],
    icon: "▭",
    group: "media",
    block: { type: "button", label: "", href: "", style: "primary" },
  },
  {
    id: "adsense",
    label: "Google AdSense",
    keywords: ["werbung", "anzeige", "ads", "ad"],
    icon: "💰",
    group: "embed",
    integration: "ads",
    block: { type: "adsense", placement: "inline", slot: null },
  },
];
