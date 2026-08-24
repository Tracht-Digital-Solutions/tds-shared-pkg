/**
 * Translating a content-change event into the set of pages it dates.
 *
 * The API sends *what changed* (`{type:"post", id:"mein-artikel", lang:"de"}`),
 * never a URL. This is where a site answers *which of my pages that is* —
 * and it is a pure function precisely so that answer is testable without a
 * server, a build or a database.
 *
 * ### Why the site owns this and the API does not
 *
 * One saved article dates its own page, the index, the paginated archive, its
 * category, each of its tags, its author page and the feed. On the blog the
 * English tree does not even mirror the German one by prefix
 * (`/kategorie/…` vs `/en/category/…`, `/autor/…` vs `/en/author/…`), and the
 * tools site *does* mirror by prefix. Encoding three route tables in the API
 * would be a fourth copy of a truth that already exists in each site's
 * `src/pages/**`, and the copies drift the first time a route is renamed —
 * silently, because a rebuild of a path that no longer exists looks exactly
 * like a rebuild that worked.
 */

/** One "this content changed" notice. Mirrors the PHP `CacheEvent`. */
export interface CacheEvent {
  /** `post`, `block`, `legal`, `tool`, `catalog`, … */
  type: string;
  /** Which one — a slug, a section key, a tool id. Absent means "all". */
  id?: string;
  /** `de` / `en`. Absent means "both language trees". */
  lang?: string;
}

/**
 * A site's answer for one event type: the paths that event dates.
 *
 * Return absolute, normalised paths (`/`, `/en/`, `/tag/astro`). Returning an
 * empty array is legitimate — a `block` event for a section that only appears
 * on the landingpage dates nothing on the blog.
 *
 * **May be async, and the blog needs that.** An article's category, tags and
 * author are properties of the article, not of the event, so working out which
 * taxonomy pages a save dates means looking the article up. Without it, saving
 * an article would never refresh the category page listing it — a gap nobody
 * would notice until a reader did.
 */
export type EventResolver = (event: CacheEvent) => string[] | Promise<string[]>;

/** The site's whole route knowledge: one resolver per event type. */
export type EventMap = Record<string, EventResolver>;

/** What {@link resolveEvents} found. */
export interface ResolvedEvents {
  /** Deduplicated, sorted paths to rebuild. */
  paths: string[];
  /**
   * Event types this site has no resolver for.
   *
   * Reported rather than ignored. A module that starts sending a new event
   * type before a site learns it would otherwise get a cheerful `200` and
   * rebuild nothing at all — the same silence this whole mechanism exists to
   * remove. The caller surfaces these; it does not fail on them, because an
   * event meant for a sibling site legitimately reaches this one.
   */
  unknown: string[];
}

/**
 * Resolve a batch of events against a site's route map.
 *
 * Sorting is not cosmetic: the rebuild endpoint reports the list back, and a
 * stable order makes two runs comparable in a log.
 */
export async function resolveEvents(
  map: EventMap,
  events: readonly CacheEvent[],
): Promise<ResolvedEvents> {
  const paths = new Set<string>();
  const unknown = new Set<string>();

  for (const event of events) {
    const resolver = map[event.type];
    if (!resolver) {
      unknown.add(event.type);
      continue;
    }
    let resolved: string[];
    try {
      resolved = await resolver(event);
    } catch {
      // A resolver that needs a lookup can fail when the API is unreachable.
      // Losing the paths for one event is far better than failing the whole
      // rebuild — the operator can rebuild everything once the API is back.
      continue;
    }
    for (const path of resolved) {
      if (typeof path === "string" && path.startsWith("/")) paths.add(path);
    }
  }

  return { paths: [...paths].sort(), unknown: [...unknown].sort() };
}

/**
 * Both language trees of a path pair, or just the one the event names.
 *
 * The shape every resolver needs and nobody should re-derive: an event without
 * a `lang` means both trees, because a tool being switched off or a section
 * being deleted changes German and English alike.
 */
export function forLanguages(
  event: CacheEvent,
  build: (lang: "de" | "en") => string[],
): string[] {
  if (event.lang === "de") return build("de");
  if (event.lang === "en") return build("en");
  return [...build("de"), ...build("en")];
}
