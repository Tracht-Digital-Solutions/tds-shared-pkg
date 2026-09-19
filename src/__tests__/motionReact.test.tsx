// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import FormAlert from "../components/FormAlert";
import ToastHost from "../components/ToastHost";
import {
  AnimatedItem,
  AnimatedList,
  Collapse,
  Presence,
  TabIndicator,
  useCoarsePointer,
} from "../motion/react";
import { toast } from "../toast";

/**
 * The React motion primitives. What matters most is not that things move —
 * that is checked in a browser — but the three promises in `motion/react.tsx`:
 * the server HTML is never shipped hidden, a leaving element stops being
 * interactive at once, and the phone-only behaviour stays off the desktop.
 */
afterEach(() => {
  cleanup();
  const w = window as Window & { __tdsToastReady?: boolean; __tdsToastQueue?: unknown[]; __tdsToastHostMounted?: boolean };
  delete w.__tdsToastReady;
  delete w.__tdsToastQueue;
  delete w.__tdsToastHostMounted;
  vi.unstubAllGlobals();
});

/** Every spelling Motion or React could emit for a hidden start state. */
const HIDDEN = /opacity:\s*0(?![.\d])/;

describe("server render — never shipped hidden", () => {
  // The landingpage hero once server-rendered `style="opacity:0"` from a
  // Motion `initial`, stayed blank until hydration and became its own LCP.
  const cases: Array<[string, ReactElement]> = [
    ["Presence", <Presence view="list"><p>Liste</p></Presence>],
    [
      "AnimatedList",
      <AnimatedList>
        <AnimatedItem key="a">Eins</AnimatedItem>
        <AnimatedItem key="b">Zwei</AnimatedItem>
      </AnimatedList>,
    ],
    ["TabIndicator", <button type="button" className="tds-tab"><TabIndicator group="ssr" /></button>],
    ["Collapse (open)", <Collapse open><p>Offen</p></Collapse>],
    ["FormAlert", <FormAlert message="Falsches Passwort." />],
    ["ToastHost", <ToastHost />],
  ];

  it.each(cases)("%s renders its finished state", (_name, element) => {
    const html = renderToString(element);
    expect(html).not.toMatch(HIDDEN);
  });

  it("renders the content itself, not a placeholder", () => {
    expect(renderToString(<Presence view="x"><p>Inhalt</p></Presence>)).toContain("Inhalt");
    expect(renderToString(<FormAlert message="Fehler da." />)).toContain("Fehler da.");
  });
});

describe("Presence", () => {
  function Swapper() {
    const [view, setView] = useState<"list" | "detail">("list");
    return (
      <>
        <button type="button" onClick={() => setView("detail")}>
          öffnen
        </button>
        <Presence view={view}>{view === "list" ? <p>Liste</p> : <p>Detail</p>}</Presence>
      </>
    );
  }

  it("shows the new view after a change", async () => {
    render(<Swapper />);
    expect(screen.getByText("Liste")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "öffnen" }));
    expect(await screen.findByText("Detail")).toBeTruthy();
  });
});

describe("Collapse", () => {
  it("renders nothing while closed", () => {
    const { container } = render(<Collapse open={false}><p>Zu</p></Collapse>);
    expect(container.innerHTML).toBe("");
  });

  it("clips its content while it animates, so nothing spills over the next field", () => {
    render(<Collapse open><p>Offen</p></Collapse>);
    const box = screen.getByText("Offen").parentElement as HTMLElement;
    expect(box.style.overflow).toBe("hidden");
  });
});

describe("FormAlert", () => {
  it("keeps showing the last message while it closes", () => {
    const { rerender } = render(<FormAlert message="Erst." />);
    rerender(<FormAlert message={null} />);
    // Still in the DOM for the exit animation — and not as an empty banner.
    const alert = document.querySelector(".form-alert");
    expect(alert, "the banner must still be there to animate out").not.toBeNull();
    expect(alert?.textContent).toContain("Erst.");
  });
});

describe("ToastHost — a leaving toast", () => {
  it("drops out of the accessibility tree and the tab order at once", () => {
    render(<ToastHost />);
    act(() => {
      toast.info("Weg damit.");
    });
    const card = document.querySelector(".tds-toast") as HTMLElement;
    expect(card.getAttribute("aria-hidden")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));

    // Still fading — and already unreachable.
    const leaving = document.querySelector(".tds-toast");
    expect(leaving, "the toast must still be there to animate out").not.toBeNull();
    expect(leaving?.getAttribute("aria-hidden")).toBe("true");
    expect(leaving?.hasAttribute("inert")).toBe(true);
  });

  it("is not draggable with a mouse — a horizontal drag there selects text", () => {
    render(<ToastHost />);
    act(() => {
      toast.info("Maus.");
    });
    const card = document.querySelector(".tds-toast") as HTMLElement;
    expect(card.style.touchAction).toBe("");
  });

  it("lets vertical swipes scroll the page on a touch screen", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<ToastHost />);
    act(() => {
      toast.info("Finger.");
    });
    const card = document.querySelector(".tds-toast") as HTMLElement;
    expect(card.style.touchAction).toBe("pan-y");
  });
});

describe("TabIndicator on a phone-width strip", () => {
  function Strip() {
    const [tab, setTab] = useState("a");
    return (
      <div role="tablist" data-testid="strip">
        {["a", "b", "c"].map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className="tds-tab"
            onClick={() => setTab(id)}
          >
            {id}
            {tab === id ? <TabIndicator group="phone" /> : null}
          </button>
        ))}
      </div>
    );
  }

  it("scrolls the strip, not the page, and only after a change", () => {
    const scrollBy = vi.fn();
    const pageScroll = vi.fn();
    vi.stubGlobal("scrollTo", pageScroll);
    Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 390 });

    render(<Strip />);
    // Page load: the strip nobody touched stays where it is.
    expect(scrollBy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "c" }));
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(pageScroll).not.toHaveBeenCalled();

    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollBy;
    delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  });
});

describe("useCoarsePointer", () => {
  function Probe() {
    return <span>{useCoarsePointer() ? "finger" : "maus"}</span>;
  }

  it("defaults to a mouse where matchMedia does not exist", () => {
    render(<Probe />);
    expect(screen.getByText("maus")).toBeTruthy();
  });

  it("reports a finger on a coarse pointer", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<Probe />);
    expect(screen.getByText("finger")).toBeTruthy();
  });

  it("renders the mouse default on the server, so hydration matches", () => {
    expect(renderToString(<Probe />)).toContain("maus");
  });
});

describe("every primitive — a leaving element is unreachable at once", () => {
  // The same promise the toast makes, for the primitives the islands use: a
  // stale error, a replaced view or a deleted row may still be fading, but it
  // must not be read out again or receive focus.
  const isLeaving = (el: Element | null) =>
    !!el && el.closest('[aria-hidden="true"]') !== null && el.closest("[inert]") !== null;

  it("Collapse: a closing block", () => {
    const { rerender } = render(<Collapse open><p>Alter Fehler.</p></Collapse>);
    rerender(<Collapse open={false}><p>Alter Fehler.</p></Collapse>);
    const stale = screen.queryByText("Alter Fehler.");
    expect(stale, "still there to animate out").not.toBeNull();
    expect(isLeaving(stale)).toBe(true);
  });

  it("Presence: the view being replaced", () => {
    const { rerender } = render(<Presence view="a"><p>Alte Ansicht</p></Presence>);
    rerender(<Presence view="b"><p>Neue Ansicht</p></Presence>);
    const old = screen.queryByText("Alte Ansicht");
    expect(old, "still there to animate out").not.toBeNull();
    expect(isLeaving(old)).toBe(true);
  });

  it("AnimatedItem: a removed row", () => {
    const { rerender } = render(
      <AnimatedList>
        <AnimatedItem key="1">Bleibt</AnimatedItem>
        <AnimatedItem key="2">Geht</AnimatedItem>
      </AnimatedList>,
    );
    rerender(
      <AnimatedList>
        <AnimatedItem key="1">Bleibt</AnimatedItem>
      </AnimatedList>,
    );
    expect(isLeaving(screen.queryByText("Geht"))).toBe(true);
    expect(isLeaving(screen.getByText("Bleibt"))).toBe(false);
  });
});
