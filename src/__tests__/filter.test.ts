// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { matchesAllWords, mountFilterBar, normalizeQuery } from "../filter";

function setup() {
  document.body.innerHTML = `
    <button type="button" class="btn btn-primary tds-filterbar__toggle" data-filter-toggle aria-expanded="false" aria-controls="bar">
      Filter <span class="tds-filterbar__count"></span>
    </button>
    <div class="tds-filterbar__panel" id="bar" hidden>
      <input type="search" data-filter-search>
      <button type="button" class="chip" data-filter-group="kind" data-value="all" aria-pressed="true">Alle</button>
      <button type="button" class="chip" data-filter-group="kind" data-value="own" aria-pressed="false">Eigene</button>
      <button type="button" class="chip" data-filter-group="sort" data-value="new" aria-pressed="true">Neu</button>
      <button type="button" class="chip" data-filter-group="sort" data-value="az" aria-pressed="false">A–Z</button>
      <button type="button" data-filter-reset>Zurücksetzen</button>
    </div>
    <ul id="list">
      <li data-kind="own" data-title="Zebra">Zebra</li>
      <li data-kind="affiliate" data-title="Apfel">Apfel</li>
      <li data-kind="own" data-title="Mango">Mango</li>
    </ul>`;
  const root = document.getElementById("bar")!;
  const items = Array.from(document.querySelectorAll<HTMLElement>("#list li"));
  const onChange = vi.fn();
  const bar = mountFilterBar(root, {
    items,
    match: (item, s) =>
      (s.groups.kind === "all" || item.dataset.kind === s.groups.kind) &&
      matchesAllWords(item.dataset.title!.toLowerCase(), s.query),
    compare: (a, b, s) => (s.groups.sort === "az" ? a.dataset.title!.localeCompare(b.dataset.title!) : 0),
    onChange,
  });
  const chip = (group: string, value: string) =>
    root.querySelector<HTMLButtonElement>(`[data-filter-group="${group}"][data-value="${value}"]`)!;
  const titles = () =>
    Array.from(document.querySelectorAll<HTMLElement>("#list li")).filter((li) => !li.hidden).map((li) => li.dataset.title);
  return { root, bar, chip, titles, onChange };
}

describe("mountFilterBar", () => {
  it("starts with everything visible, no count and a disabled reset", () => {
    const { root, titles, onChange } = setup();
    expect(titles()).toEqual(["Zebra", "Apfel", "Mango"]);
    expect(document.querySelector(".tds-filterbar__count")!.textContent).toBe("");
    expect(root.querySelector<HTMLButtonElement>("[data-filter-reset]")!.disabled).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(3, expect.anything());
  });

  it("a chip filters, presses itself and counts as one active filter", () => {
    const { root, chip, titles } = setup();
    chip("kind", "own").click();
    expect(titles()).toEqual(["Zebra", "Mango"]);
    expect(chip("kind", "own").getAttribute("aria-pressed")).toBe("true");
    expect(chip("kind", "all").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".tds-filterbar__count")!.textContent).toBe("1");
  });

  it("sorts only off the default, and returns to the server order", () => {
    const { chip, titles } = setup();
    chip("sort", "az").click();
    expect(titles()).toEqual(["Apfel", "Mango", "Zebra"]);
    chip("sort", "new").click();
    expect(titles()).toEqual(["Zebra", "Apfel", "Mango"]);
  });

  it("search matches every word and reset restores all defaults", () => {
    const { root, chip, titles, bar } = setup();
    const input = root.querySelector<HTMLInputElement>("[data-filter-search]")!;
    input.value = "  MAN ";
    input.dispatchEvent(new Event("input"));
    chip("sort", "az").click();
    expect(titles()).toEqual(["Mango"]);
    expect(document.querySelector(".tds-filterbar__count")!.textContent).toBe("2");
    root.querySelector<HTMLButtonElement>("[data-filter-reset]")!.click();
    expect(input.value).toBe("");
    expect(titles()).toEqual(["Zebra", "Apfel", "Mango"]);
    expect(bar.state()).toEqual({ query: "", groups: { kind: "all", sort: "new" } });
  });
});

describe("the toggle", () => {
  it("opens and closes the panel it controls and focuses the search", () => {
    const { root } = setup();
    const toggle = document.querySelector<HTMLButtonElement>("[data-filter-toggle]")!;
    expect(root.hidden).toBe(true);
    toggle.click();
    expect(root.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(root.querySelector("[data-filter-search]"));
    toggle.click();
    expect(root.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("query helpers", () => {
  it("normalises and matches all words", () => {
    expect(normalizeQuery("  Web   SHOP ")).toBe("web shop");
    expect(matchesAllWords("lohnt sich ein webshop", "web kasse")).toBe(false);
    expect(matchesAllWords("lohnt sich ein webshop", "webshop lohnt")).toBe(true);
    expect(matchesAllWords("x", "")).toBe(true);
  });
});
