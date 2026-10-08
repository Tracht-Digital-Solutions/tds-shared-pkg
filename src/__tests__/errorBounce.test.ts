// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { errorBounceScript } from "../astro";
import { BOUNCE_KEYFRAMES, bounce } from "../motion";

/**
 * The error bounce reacts to what a page already does when it fails, so these
 * tests drive the DOM the way an island would and watch `Element.animate`.
 * jsdom has no Web Animations; the prototype stub records who was asked to move.
 */
let moved: Element[];

// Installed ONCE, like a page: a second install would be a second observer.
beforeAll(() => {
  // eslint-disable-next-line no-new-func
  new Function(errorBounceScript)();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  moved = [];
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value(this: Element) {
      moved.push(this);
      return { id: "", cancel() {} };
    },
  });
  Object.defineProperty(Element.prototype, "getAnimations", { configurable: true, value: () => [] });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  document.body.innerHTML = "";
});

afterEach(() => {
  delete (Element.prototype as Partial<Element>).animate;
  vi.unstubAllGlobals();
});

describe("errorBounceScript", () => {
  it("shakes an alert that appears, and the button that caused it", async () => {
    document.body.innerHTML = '<form><button type="submit">Senden</button></form><div id="slot"></div>';
    const button = document.querySelector("button")!;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.textContent = "Das hat nicht geklappt.";
    document.getElementById("slot")!.append(alert);
    await flush();
    expect(moved).toContain(alert);
    expect(moved).toContain(button);
  });

  it("shakes a field whose aria-invalid turns true, once", async () => {
    document.body.innerHTML = '<input id="email" aria-invalid="false">';
    const field = document.getElementById("email")!;
    field.setAttribute("aria-invalid", "true");
    await flush();
    field.setAttribute("aria-invalid", "true");
    await flush();
    expect(moved.filter((el) => el === field)).toHaveLength(1);
  });

  it("shakes a field the browser refuses", () => {
    document.body.innerHTML = '<input id="email" required>';
    const field = document.getElementById("email")!;
    field.dispatchEvent(new Event("invalid"));
    expect(moved).toContain(field);
  });

  it("shakes an alert whose text changes", async () => {
    document.body.innerHTML = '<p class="form-alert" role="alert">Erster Fehler</p>';
    await flush();
    moved = [];
    document.querySelector(".form-alert")!.firstChild!.textContent = "Zweiter Fehler";
    await flush();
    expect(moved).toContain(document.querySelector(".form-alert"));
  });

  it("leaves a successful status alone, and an opted-out alert", async () => {
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "Gespeichert.";
    const quiet = document.createElement("p");
    quiet.setAttribute("role", "alert");
    quiet.setAttribute("data-bounce", "off");
    quiet.textContent = "Hinweis";
    document.body.append(status, quiet);
    await flush();
    expect(moved).toEqual([]);
  });

  it("does nothing under reduced motion", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const alert = document.createElement("p");
    alert.setAttribute("role", "alert");
    alert.textContent = "Fehler";
    document.body.append(alert);
    await flush();
    expect(moved).toEqual([]);
  });
});

describe("bounce", () => {
  it("delegates to the installed script, and ends at rest", () => {
    const el = document.createElement("button");
    document.body.append(el);
    bounce(el);
    expect(moved).toEqual([el]);
    expect(BOUNCE_KEYFRAMES[0]).toEqual({ translate: "0px 0px" });
    expect(BOUNCE_KEYFRAMES[BOUNCE_KEYFRAMES.length - 1]).toEqual({ translate: "0px 0px" });
  });
});
