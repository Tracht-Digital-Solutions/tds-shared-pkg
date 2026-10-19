import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy to the clipboard, plus the "Kopiert ✓" flag every copy button shows.
 *
 * Before 0.59 nine islands across the tool packs and panel extensions wrote
 * this by hand. Two left their reset timer running after unmount (a vanished
 * island then set state), one reported success when the copy had failed.
 */

/**
 * Copies `text`. Falls back to a hidden textarea + `execCommand("copy")` where
 * the async API is missing or refused (insecure origin, embedded frame).
 * Resolves `true` only when something was actually copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("no async clipboard");
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** How long a button keeps saying "Kopiert". */
export const COPY_FLAG_MS = 1500;

/**
 * `{ copied, copy, reset }`. `copy(text)` resolves to whether it worked; the
 * flag turns on only on success and falls back after `delayMs`. The timer
 * lives in a ref and is cleared on unmount — an Astro island is torn down on
 * navigation, and a live timer would set state on a component that is gone.
 */
export function useCopyFlag(delayMs = COPY_FLAG_MS) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (!text) return false;
      const ok = await copyText(text);
      if (timer.current !== null) clearTimeout(timer.current);
      setCopied(ok);
      if (ok) timer.current = setTimeout(() => setCopied(false), delayMs);
      return ok;
    },
    [delayMs],
  );

  const reset = useCallback(() => setCopied(false), []);

  return { copied, copy, reset };
}
