// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ToastHost from "../components/ToastHost";
import { TOAST_DURATIONS, TOAST_EVENT, showToast, toast } from "../toast";

/**
 * The toast system's contract, in the order it matters:
 *
 *  1. the two live regions exist BEFORE any message (a region inserted
 *     together with its text is not announced — the single most important
 *     assertion in this file, and the one most likely to be "optimised" away),
 *  2. failures are assertive and everything else is polite,
 *  3. a toast never steals focus,
 *  4. `showToast` cannot throw into the caller it reports on,
 *  5. the timer bookkeeping — auto-dismiss, hover-pause, per-region cap, dedup
 *     — because every one of those bugs is invisible until a user is annoyed.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  const w = window as Window & { __tdsToastReady?: boolean; __tdsToastQueue?: unknown[]; __tdsToastHostMounted?: boolean };
  delete w.__tdsToastReady;
  delete w.__tdsToastQueue;
  delete w.__tdsToastHostMounted;
});

/** Raise a toast from outside React and let the host's state settle. */
function raise(fn: () => void) {
  act(() => {
    fn();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("live regions", () => {
  it("renders both live regions before any toast exists", () => {
    render(<ToastHost />);
    // Empty, but present — this is what makes the first message announce.
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("keeps the politeness split: danger is assertive, the rest polite", () => {
    render(<ToastHost />);
    raise(() => toast.danger("Fehlgeschlagen."));
    raise(() => toast.success("Gespeichert."));
    raise(() => toast.warning("Achtung."));
    raise(() => toast.info("Hinweis."));

    expect(screen.getByRole("alert").textContent).toContain("Fehlgeschlagen.");
    const polite = screen.getByRole("status").textContent ?? "";
    expect(polite).toContain("Gespeichert.");
    expect(polite).toContain("Achtung.");
    expect(polite).toContain("Hinweis.");
    expect(polite).not.toContain("Fehlgeschlagen.");
  });

  it("never moves focus when a toast appears", () => {
    render(<ToastHost />);
    raise(() => toast.danger("Fehlgeschlagen."));
    expect(document.activeElement).toBe(document.body);
  });

  it("renders the message as text, so markup in it stays inert", () => {
    render(<ToastHost />);
    raise(() => toast.info("<script>alert(1)</script>"));
    const region = screen.getByRole("status");
    expect(region.querySelector("script")).toBeNull();
    expect(region.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("variants", () => {
  it("applies the variant class", () => {
    render(<ToastHost />);
    raise(() => toast.success("Gespeichert."));
    expect(document.querySelector(".tds-toast--success")).toBeTruthy();
  });

  it("falls back to info for a variant that has no rule", () => {
    render(<ToastHost />);
    // Straight off the bus — an older extension or a console call can send
    // anything, and an unstyled toast would be a colourless signal.
    raise(() => {
      window.dispatchEvent(
        new CustomEvent(TOAST_EVENT, { detail: { variant: "chartreuse", message: "Hm." } }),
      );
    });
    expect(document.querySelector(".tds-toast--info")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Hm.");
  });
});

describe("dismissal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("auto-dismisses a success after its duration", () => {
    render(<ToastHost />);
    raise(() => toast.success("Gespeichert."));
    advance(TOAST_DURATIONS.success - 100);
    expect(screen.getByRole("status").textContent).toContain("Gespeichert.");
    advance(200);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("gives a failure the longer duration", () => {
    render(<ToastHost />);
    raise(() => toast.danger("Fehlgeschlagen."));
    advance(TOAST_DURATIONS.success + 100);
    expect(screen.getByRole("alert").textContent).toContain("Fehlgeschlagen.");
    advance(TOAST_DURATIONS.danger);
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("keeps a toast with duration 0 until it is dismissed", () => {
    render(<ToastHost />);
    raise(() => showToast({ variant: "info", message: "Bleibt.", duration: 0 }));
    advance(60_000);
    expect(screen.getByRole("status").textContent).toContain("Bleibt.");
  });

  it("dismisses on the close button", () => {
    render(<ToastHost />);
    raise(() => toast.info("Hinweis."));
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("pauses the timer while the stack is hovered and resumes after", () => {
    render(<ToastHost />);
    raise(() => toast.success("Gespeichert."));
    advance(1000);
    act(() => {
      fireEvent.mouseEnter(document.querySelector(".tds-toast-host") as HTMLElement);
    });
    advance(TOAST_DURATIONS.success * 2);
    expect(screen.getByRole("status").textContent).toContain("Gespeichert.");
    act(() => {
      fireEvent.mouseLeave(document.querySelector(".tds-toast-host") as HTMLElement);
    });
    // Only the banked remainder is left, not a fresh full duration.
    advance(TOAST_DURATIONS.success - 900);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("does not restart the other toasts' timers when a new one arrives", () => {
    render(<ToastHost />);
    raise(() => toast.success("Erste."));
    advance(TOAST_DURATIONS.success - 200);
    raise(() => toast.info("Zweite."));
    advance(300);
    // The first must have expired on its own schedule.
    const polite = screen.getByRole("status").textContent ?? "";
    expect(polite).not.toContain("Erste.");
    expect(polite).toContain("Zweite.");
  });
});

describe("stacking", () => {
  it("caps a region at three and evicts the oldest", () => {
    render(<ToastHost />);
    for (const n of [1, 2, 3, 4]) raise(() => toast.info(`Meldung ${n}`));
    const polite = screen.getByRole("status").textContent ?? "";
    expect(polite).not.toContain("Meldung 1");
    for (const n of [2, 3, 4]) expect(polite).toContain(`Meldung ${n}`);
  });

  it("caps each region separately, so successes cannot evict a failure", () => {
    render(<ToastHost />);
    raise(() => toast.danger("Fehlgeschlagen."));
    for (const n of [1, 2, 3]) raise(() => toast.success(`Gespeichert ${n}`));
    expect(screen.getByRole("alert").textContent).toContain("Fehlgeschlagen.");
  });

  it("counts a repeated message instead of stacking it", () => {
    render(<ToastHost />);
    raise(() => toast.danger("Fehlgeschlagen (HTTP 500)."));
    raise(() => toast.danger("Fehlgeschlagen (HTTP 500)."));
    expect(document.querySelectorAll(".tds-toast").length).toBe(1);
    expect(screen.getByRole("alert").textContent).toContain("×2");
  });
});

describe("the bus", () => {
  it("delivers a toast raised before the host mounted", () => {
    raise(() => toast.success("Früh."));
    render(<ToastHost />);
    expect(screen.getByRole("status").textContent).toContain("Früh.");
  });

  it("delivers a buffered toast only once", () => {
    raise(() => toast.success("Früh."));
    render(<ToastHost />);
    expect(document.querySelectorAll(".tds-toast").length).toBe(1);
  });

  it("never throws, even when dispatching fails", () => {
    const spy = vi.spyOn(window, "dispatchEvent").mockImplementation(() => {
      throw new Error("nope");
    });
    expect(() => toast.danger("Fehlgeschlagen.")).not.toThrow();
    spy.mockRestore();
  });

  it("ignores an empty message", () => {
    render(<ToastHost />);
    raise(() => toast.info(""));
    expect(document.querySelectorAll(".tds-toast").length).toBe(0);
  });

  it("stops listening after unmount", () => {
    const { unmount } = render(<ToastHost />);
    unmount();
    raise(() => toast.info("Zu spät."));
    expect(document.querySelectorAll(".tds-toast").length).toBe(0);
  });

  it("renders nothing from a second host, rather than doubling every toast", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<ToastHost />);
    render(<ToastHost />);
    raise(() => toast.info("Einmal."));
    expect(document.querySelectorAll(".tds-toast").length).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("href", () => {
  it("renders the message as a link when a target is given", () => {
    render(<ToastHost />);
    raise(() => toast.info("Neue Kontaktanfrage: Max Mustermann", { href: "/kontakt?id=42" }));
    const link = screen.getByRole("link", { name: /Neue Kontaktanfrage/ });
    expect(link.getAttribute("href")).toBe("/kontakt?id=42");
  });

  it("stays a text node without one", () => {
    render(<ToastHost />);
    raise(() => toast.info("Gespeichert."));
    expect(document.querySelector(".tds-toast__link")).toBeNull();
  });

  it("keeps the repeat counter outside the link", () => {
    // The count is bookkeeping about the toast, not part of what the link
    // leads to — announcing "…Mustermann ×2" as the link text would be wrong.
    render(<ToastHost />);
    raise(() => toast.info("Neue Kontaktanfrage", { key: "c:1", href: "/kontakt?id=42" }));
    raise(() => toast.info("Neue Kontaktanfrage", { key: "c:1", href: "/kontakt?id=42" }));
    expect(screen.getByRole("link").textContent).toBe("Neue Kontaktanfrage");
    expect(document.querySelector(".tds-toast__count")?.textContent).toBe("×2");
  });

  it.each(["https://evil.example/x", "//evil.example/x", "javascript:alert(1)", "kontakt"])(
    "refuses %s — the detail arrives over a public window event",
    (href) => {
      render(<ToastHost />);
      raise(() => toast.info("Behauptung.", { href }));
      expect(document.querySelectorAll(".tds-toast").length).toBe(1);
      expect(document.querySelector(".tds-toast__link")).toBeNull();
    },
  );
});

describe("i18n", () => {
  it("names the dismiss control in the requested language", () => {
    render(<ToastHost lang="en" />);
    raise(() => toast.info("Heads up."));
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });
});
