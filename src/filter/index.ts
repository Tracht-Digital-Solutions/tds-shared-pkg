/**
 * The behaviour behind `.tds-filterbar` (primitives.css) for server-rendered
 * listings: the shop catalogue and the tools catalogue.
 *
 * The public sites' page cache keys on the path alone, so a filter can never
 * be a query string the server answers. Every entry is already in the HTML;
 * this hides the ones that don't match (`hidden`), optionally reorders them
 * inside their own parent, and reports the result. No React, no side effects
 * until `mountFilterBar()` is called.
 *
 * Markup contract, inside `root` (usually the `<details class="tds-filterbar">`):
 * - `[data-filter-search]`: an `<input>`; its value is `state.query`.
 * - `button[data-filter-group][data-value]`: single-choice chips. The chip
 *   with `aria-pressed="true"` in the SSR markup is that group's default.
 * - `[data-filter-reset]`: a button that restores every default.
 * - `.tds-filterbar__count`: filled with the number of active filters.
 */

/** Search text plus one value per chip group. */
export interface FilterState {
  query: string;
  groups: Record<string, string>;
}

export interface FilterBarOptions {
  /** The entries to filter. Their DOM order on mount is the "default" order. */
  items: HTMLElement[];
  /** Whether an entry stays visible. `query` arrives trimmed and lower-cased. */
  match: (item: HTMLElement, state: FilterState) => boolean;
  /**
   * Order visible entries inside their parent. Return 0 to keep the mount
   * order. Called only while some group differs from its default, so the
   * default view always keeps the server's order.
   */
  compare?: (a: HTMLElement, b: HTMLElement, state: FilterState) => number;
  /** After every change, with the visible count. Update a live region here. */
  onChange?: (visible: number, state: FilterState) => void;
}

export interface FilterBar {
  state: () => FilterState;
  reset: () => void;
  destroy: () => void;
}

/** Lower-cased, trimmed, whitespace collapsed: what `match` compares against. */
export function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Every word of the query occurs in `haystack` (already lower-cased). */
export function matchesAllWords(haystack: string, query: string): boolean {
  if (!query) return true;
  return query.split(" ").every((word) => haystack.includes(word));
}

export function mountFilterBar(root: HTMLElement, options: FilterBarOptions): FilterBar {
  const search = root.querySelector<HTMLInputElement>("[data-filter-search]");
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-filter-group][data-value]"));
  const resetButton = root.querySelector<HTMLButtonElement>("[data-filter-reset]");
  const count = root.querySelector<HTMLElement>(".tds-filterbar__count");

  const defaults: Record<string, string> = {};
  for (const chip of chips) {
    const group = chip.dataset.filterGroup!;
    if (!(group in defaults) || chip.getAttribute("aria-pressed") === "true") defaults[group] = chip.dataset.value!;
  }
  const order = new Map(options.items.map((item, index) => [item, index]));
  let state: FilterState = { query: "", groups: { ...defaults } };

  const activeCount = () =>
    (state.query ? 1 : 0) + Object.keys(defaults).filter((g) => state.groups[g] !== defaults[g]).length;

  function apply() {
    let visible = 0;
    for (const item of options.items) {
      const show = options.match(item, state);
      item.hidden = !show;
      if (show) visible += 1;
    }

    const reorder = options.compare && Object.keys(defaults).some((g) => state.groups[g] !== defaults[g]);
    const parents = new Set(options.items.map((item) => item.parentElement).filter(Boolean) as HTMLElement[]);
    for (const parent of parents) {
      const own = options.items.filter((item) => item.parentElement === parent);
      own.sort((a, b) => (reorder ? options.compare!(a, b, state) : 0) || order.get(a)! - order.get(b)!);
      // appendChild moves; only touch the DOM when the order actually changed.
      const current = Array.from(parent.children).filter((el) => order.has(el as HTMLElement));
      if (own.some((item, i) => item !== current[i])) for (const item of own) parent.appendChild(item);
    }

    for (const chip of chips) {
      chip.setAttribute("aria-pressed", String(state.groups[chip.dataset.filterGroup!] === chip.dataset.value));
    }
    const active = activeCount();
    if (count) count.textContent = active > 0 ? String(active) : "";
    if (resetButton) resetButton.disabled = active === 0;
    options.onChange?.(visible, state);
  }

  const onChip = (event: Event) => {
    const chip = event.currentTarget as HTMLButtonElement;
    state = { ...state, groups: { ...state.groups, [chip.dataset.filterGroup!]: chip.dataset.value! } };
    apply();
  };
  const onSearch = () => {
    state = { ...state, query: normalizeQuery(search!.value) };
    apply();
  };
  const reset = () => {
    if (search) search.value = "";
    state = { query: "", groups: { ...defaults } };
    apply();
  };

  for (const chip of chips) chip.addEventListener("click", onChip);
  search?.addEventListener("input", onSearch);
  resetButton?.addEventListener("click", reset);

  // A browser restoring form state (back button) may have refilled the field.
  if (search?.value) state.query = normalizeQuery(search.value);
  apply();

  return {
    state: () => state,
    reset,
    destroy() {
      for (const chip of chips) chip.removeEventListener("click", onChip);
      search?.removeEventListener("input", onSearch);
      resetButton?.removeEventListener("click", reset);
    },
  };
}
