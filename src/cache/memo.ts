/**
 * A memo that a cache rebuild can throw away.
 *
 * ### The bug this exists to prevent
 *
 * Every one of the three public sites memoises its API reads in a module-level
 * `Map` or `let … = null`. Under `output: "static"` that is exactly right: one
 * build, one process, one fetch per language, and the process exits. Under SSR
 * the very same line means *once per process lifetime* — so the server would
 * answer with the content it read at boot, forever. Rebuilding a page's cache
 * would faithfully re-render the stale data and report success, the panel
 * would show the save went through, and the public page would never change.
 * Nothing logs, nothing throws, nothing is red.
 *
 * Six call sites had that shape when the SSR move began: the landingpage's
 * `cms.ts` and `legal.ts`, the blog's `content-api.ts` (twice), `taxonomy.ts`
 * and `translate.ts`, and the tools site's `catalog.ts`.
 *
 * The fix is not "drop the memo" — a page render fans out into a dozen section
 * components that each ask for the same blocks, and un-memoised that is a
 * dozen HTTP round trips per page. It is a memo with an owner: the rebuild
 * endpoint calls {@link GenerationCache.invalidate} before it re-renders, so a
 * rebuild always reads through.
 */

export interface GenerationCache {
  /**
   * Memoised read. Concurrent callers with the same key share one `load()`.
   *
   * A rejected load is NOT remembered: an API hiccup during one render must
   * not pin an error for the life of the process, which is the failure mode
   * that made the fail-soft fetches fail-hard.
   */
  get<T>(key: string, load: () => Promise<T>): Promise<T>;
  /** Drop everything. Called before a rebuild renders. */
  invalidate(): void;
  /** How many times {@link invalidate} has run — handy in a status payload. */
  readonly generation: number;
}

export function createGenerationCache(): GenerationCache {
  let entries = new Map<string, Promise<unknown>>();
  let generation = 0;

  return {
    get<T>(key: string, load: () => Promise<T>): Promise<T> {
      const existing = entries.get(key) as Promise<T> | undefined;
      if (existing) return existing;

      const bornIn = generation;
      const pending = load().catch((err: unknown) => {
        // Only evict our own entry, and only if no invalidate() has happened
        // meanwhile — otherwise a slow failing load from the previous
        // generation would delete a fresh entry somebody else just stored.
        if (generation === bornIn && entries.get(key) === pending) entries.delete(key);
        throw err;
      });

      entries.set(key, pending);
      return pending;
    },

    invalidate(): void {
      generation += 1;
      // A new Map rather than `.clear()`, so any in-flight load still holding
      // a reference to the old one cannot resurrect an entry into this
      // generation when it settles.
      entries = new Map();
    },

    get generation(): number {
      return generation;
    },
  };
}
