// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hoverTipScript } from "../astro";

/**
 * The hover tip reads what a control already says about itself, so these
 * tests hover real markup and look at the one tip element the script owns.
 * jsdom has no PointerEvent; a MouseEvent with `pointerType` stands in.
 */
const fine = { matches: true };

beforeAll(() => {
  vi.stubGlobal("matchMedia", () => fine);
  // Installed ONCE, like a page.
  // eslint-disable-next-line no-new-func
  new Function(hoverTipScript)();
});

beforeEach(() => {
  vi.useFakeTimers();
  fine.matches = true;
  document.documentElement.lang = "de";
  document.body.innerHTML = "";
});

afterEach(() => {
  // Leave the previous tip closed and the warm window spent.
  window.dispatchEvent(new Event("keydown"));
  vi.useRealTimers();
});

function hover(el: Element, pointerType = "mouse"): void {
  const over = new MouseEvent("pointerover", { bubbles: true });
  Object.defineProperty(over, "pointerType", { value: pointerType });
  el.dispatchEvent(over);
}

function leave(el: Element): void {
  const out = new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body });
  el.dispatchEvent(out);
}

const tip = () => document.querySelector<HTMLElement>(".tds-hover-tip");
const shown = () => (tip()?.hasAttribute("data-open") ? tip()!.textContent : null);

describe("hoverTipScript", () => {
  it("shows an icon button's label only after the pointer rests", () => {
    document.body.innerHTML = `<button aria-label="Menü öffnen"><svg></svg></button>`;
    hover(document.querySelector("svg")!);
    vi.advanceTimersByTime(500);
    expect(shown()).toBeNull();
    vi.advanceTimersByTime(300);
    expect(shown()).toBe("Menü öffnen");
    expect(tip()!.getAttribute("aria-hidden")).toBe("true");
  });

  it("says nothing for a button whose text already says it", () => {
    document.body.innerHTML = `<button>Absenden</button>`;
    hover(document.querySelector("button")!);
    vi.advanceTimersByTime(1000);
    expect(shown()).toBeNull();
  });

  it("prefers data-tip and honours an opt-out", () => {
    document.body.innerHTML = `<button data-tip="Legt das Paket in den Warenkorb">Hinzufügen</button>
      <div data-no-tip><button aria-label="Schließen">×</button></div>`;
    hover(document.querySelector("button")!);
    vi.advanceTimersByTime(800);
    expect(shown()).toBe("Legt das Paket in den Warenkorb");
    leave(document.querySelector("button")!);
    hover(document.querySelector("[data-no-tip] button")!);
    vi.advanceTimersByTime(800);
    expect(shown()).toBeNull();
  });

  it("moves a title into data-tip so the native tooltip stays away", () => {
    document.body.innerHTML = `<button title="Drucken"><svg></svg></button>`;
    const button = document.querySelector("button")!;
    hover(button);
    expect(button.hasAttribute("title")).toBe(false);
    expect(button.getAttribute("aria-label")).toBe("Drucken");
    vi.advanceTimersByTime(800);
    expect(shown()).toBe("Drucken");
  });

  it("tells where a link leads when the text does not", () => {
    document.body.innerHTML = `<a class="btn" href="https://blog.example.org/x" target="_blank">Zum Ratgeber</a>`;
    hover(document.querySelector("a")!);
    vi.advanceTimersByTime(800);
    expect(shown()).toBe("Öffnet blog.example.org in einem neuen Tab");
  });

  it("speaks English on an English page", () => {
    document.documentElement.lang = "en";
    document.body.innerHTML = `<a class="btn" href="mailto:hello@example.org">Write</a>`;
    hover(document.querySelector("a")!);
    vi.advanceTimersByTime(800);
    expect(shown()).toBe("Email hello@example.org");
  });

  it("shows the next tip at once while warm, and never for touch", () => {
    document.body.innerHTML = `<button aria-label="Eins">1</button><button aria-label="Zwei">2</button>`;
    const [one, two] = Array.from(document.querySelectorAll("button"));
    hover(one!);
    vi.advanceTimersByTime(800);
    leave(one!);
    hover(two!);
    vi.advanceTimersByTime(1);
    expect(shown()).toBe("Zwei");
    leave(two!);
    window.dispatchEvent(new Event("keydown"));
    hover(one!, "touch");
    vi.advanceTimersByTime(1000);
    expect(shown()).toBeNull();
  });

  it("hides on a press", () => {
    document.body.innerHTML = `<button aria-label="Teilen"><svg></svg></button>`;
    hover(document.querySelector("button")!);
    vi.advanceTimersByTime(800);
    expect(shown()).toBe("Teilen");
    window.dispatchEvent(new Event("pointerdown"));
    expect(shown()).toBeNull();
  });
});
