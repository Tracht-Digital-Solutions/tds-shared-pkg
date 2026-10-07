# Copy and shared schemas

## i18n copy (`src/i18n/translations.ts`)

The DE/EN copy is the source of truth; change it here and release, never duplicate it into a frontend.

- **`footer.slogan`** is the brand claim ("Digitale Lösungen, die passen." / "Digital solutions that fit."). The landing
  page renders it as the hero H1, so one edit drives hero, footer and OG card. `hero.tagline` was removed.
- **Audience:** freelancers, small businesses and local trades. Framework names stay out of `services.items[].tags`;
  "Mittelstand" and "SaaS" stay out entirely.
- **No free or time-boxed initial consultation, without exception:** nothing in `hero.cta1`, `consulting.*`, `about.stat*`,
  `pricing.*` or the landing page's FAQ may promise "kostenlos" / "kostenfrei" / "30 Minuten" / "free".
  `pricing.ctaButton` is "Unverbindlich anfragen" / "Get in touch". The only legitimate "free" is
  `cookieNotice.consentText` (consent voluntariness).
- **No customer references**; `portfolio.*` exists but isn't mounted.
- **No "echt" / "wirklich"** (the landing page scans these strings).
- **`services.items` has five entries and the fifth renders full width** in the landing page's services layout; adding or
  removing one changes that.
- Labels that belong to one component (e.g. `AccountMenu`) live in the component, not in this bundle.

## Blog blocks (`schemas/blogBlocks`)

The source of truth for the block editor and renderer. A post's `body` is markdown (`bodyFormat="markdown"`) or a JSON
`BlogDocument` (`bodyFormat="blocks"`).

- `BlogBlockSchema` is a discriminated union; text fields hold **inline markdown**.
- `BLOG_BLOCKS` drives the editor's slash menu. `integration: "ads"` gates AdSense; `integration: "shop"` gates the
  `product` block. Admin-defined custom blocks (`type: "custom"`) are appended at runtime.
- Backends hand-mirror validation; keep them in sync. Don't move the catalog into a frontend.

## Card blocks (`schemas/cardBlocks`)

The contract between the panel editor (`tds-ext-cards-pkg`) and the card renderer (`tds-card-frontend`), which release
separately.

- **`parseCardDocument` is fail-soft per block** (unlike `CardDocumentSchema.parse`): one broken `href` costs that block,
  never the card on a customer's domain.
- An `href` may be empty, but anything non-empty must be `http(s)`, `mailto:` or `tel:` (`javascript:` would be a stored
  script).
- `Support\CardBlocks` in the extension hand-mirrors this; keep them in sync.
