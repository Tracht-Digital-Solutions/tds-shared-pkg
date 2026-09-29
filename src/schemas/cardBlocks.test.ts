import { describe, expect, it } from "vitest";

import {
  CARD_BLOCK_CATALOG,
  CardBlockSchema,
  cardBlockHasContent,
  emptyCardDocument,
  isSafeHref,
  parseCardDocument,
} from "./cardBlocks";

describe("isSafeHref", () => {
  it("accepts the four schemes a card needs", () => {
    expect(isSafeHref("https://mira-markt.de")).toBe(true);
    expect(isSafeHref("http://mira-markt.de")).toBe(true);
    expect(isSafeHref("mailto:hallo@mira-markt.de")).toBe(true);
    expect(isSafeHref("tel:+4915112345678")).toBe(true);
  });

  it("rejects a script URL", () => {
    // This is the whole reason the check exists. A card is rendered on the
    // customer's own domain, where a pasted script runs unnoticed.
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("JavaScript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejects a relative target and a protocol-relative one", () => {
    // A card is one page, so a relative link is always a mistake — and allowing
    // it would allow `//evil.example`, which the browser reads as absolute.
    expect(isSafeHref("/impressum")).toBe(false);
    expect(isSafeHref("//evil.example")).toBe(false);
    expect(isSafeHref("")).toBe(false);
    expect(isSafeHref("   ")).toBe(false);
  });
});

describe("parseCardDocument", () => {
  const link = { type: "links", items: [{ label: "Anrufen", href: "tel:+49123" }] };

  it("reads a wrapped document", () => {
    expect(parseCardDocument(JSON.stringify({ version: 1, blocks: [link] }))).toHaveLength(1);
  });

  it("reads a bare array too", () => {
    // A row written by hand or by a seed is as valid as one the panel wrote.
    expect(parseCardDocument(JSON.stringify([link]))).toHaveLength(1);
  });

  it("drops only the broken block, never the card", () => {
    const blocks = parseCardDocument(
      JSON.stringify({
        version: 1,
        blocks: [
          link,
          { type: "links", items: [{ label: "Bad", href: "javascript:alert(1)" }] },
          { type: "nope", text: "?" },
          { type: "heading", text: "Kontakt" },
        ],
      }),
    );
    expect(blocks.map((b) => b.type)).toEqual(["links", "heading"]);
  });

  it("answers with nothing for junk instead of throwing", () => {
    expect(parseCardDocument("{ not json")).toEqual([]);
    expect(parseCardDocument(JSON.stringify({ nope: true }))).toEqual([]);
    expect(parseCardDocument(null)).toEqual([]);
    expect(parseCardDocument("")).toEqual([]);
  });
});

describe("cardBlockHasContent", () => {
  it("calls a just-inserted block empty", () => {
    // The editor must be able to save a half-finished card, so the schema
    // accepts empty text; the renderer is what refuses to print it.
    for (const entry of CARD_BLOCK_CATALOG) {
      if (entry.id === "divider") continue;
      expect(cardBlockHasContent(entry.block)).toBe(false);
    }
  });

  it("calls a filled block content", () => {
    expect(cardBlockHasContent({ type: "heading", text: "Kontakt" })).toBe(true);
    expect(
      cardBlockHasContent({ type: "links", label: null, items: [{ label: "x", href: "tel:+1" }] }),
    ).toBe(true);
  });
});

describe("the editor catalog", () => {
  it("offers every block type the schema knows", () => {
    const inSchema = CardBlockSchema.options.map((o) => o.shape.type.value).sort();
    expect(CARD_BLOCK_CATALOG.map((c) => c.id).sort()).toEqual(inSchema);
  });

  it("only offers blocks that validate", () => {
    // A catalog entry that does not parse is an "add block" button that saves
    // nothing, and the failure would surface as a rejected save far from here.
    for (const entry of CARD_BLOCK_CATALOG) {
      expect(CardBlockSchema.safeParse(entry.block).success).toBe(true);
    }
  });

  it("starts a fresh card with a link group", () => {
    expect(emptyCardDocument().blocks[0]?.type).toBe("links");
  });
});
