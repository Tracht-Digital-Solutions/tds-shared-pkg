import { useEffect, useState } from "react";
import type { ConsentCategory } from "./categories";
import { consentGranted, onConsentChange } from "./store";

/**
 * Whether this category is currently consented to, kept live.
 *
 * Starts at `false` on every render path, including the server one, and only
 * becomes true after the mount effect has read storage. That ordering is not a
 * hydration workaround, it is the behaviour: a component that guards a
 * third-party embed must render the CLOSED state first, because a React tree
 * that renders the iframe optimistically has already made the request by the
 * time the effect corrects it.
 */
export function useConsent(category: ConsentCategory): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    setGranted(consentGranted(category));
    return onConsentChange((record) => {
      setGranted(category === "necessary" || record.choices[category] === true);
    });
  }, [category]);

  return granted;
}
