import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabsProps<T extends string> {
  /** `[id, label]` pairs in display order. */
  tabs: ReadonlyArray<readonly [T, ReactNode]>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for the tab and panel ids (`<prefix>-tab-<id>`, `<prefix>-panel-<id>`). Unique per page. */
  idPrefix: string;
  className?: string;
}

/** The ids `Tabs` and `TabPanel` agree on. */
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const tabPanelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * A WAI-ARIA tab list of chips: `role="tablist"`, roving `tabindex`,
 * ←/→/Home/End move and activate. Pair each view with a `<TabPanel>`.
 *
 * Promoted in 0.58 from five panel copies (access, profile, analytics, Lexware,
 * wiki), which disagreed on the active class and on whether a tab named its
 * panel at all.
 */
export default function Tabs<T extends string>({ tabs, value, onChange, label, idPrefix, className }: TabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex(([id]) => id === value);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const id = tabs[next]![0];
    onChange(id);
    list.current?.querySelector<HTMLElement>(`#${CSS.escape(tabId(idPrefix, id))}`)?.focus();
  };

  return (
    <div ref={list} className={`tds-toolbar${className ? ` ${className}` : ""}`} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map(([id, text]) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={tabId(idPrefix, id)}
            aria-selected={active}
            aria-controls={tabPanelId(idPrefix, id)}
            tabIndex={active ? 0 : -1}
            className={active ? "chip tds-tab chip-active" : "chip tds-tab"}
            onClick={() => onChange(id)}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  id: string;
  /** The panel of the selected tab. Inactive panels render `hidden` (state kept) unless `unmount`. */
  active: boolean;
  /** Drop an inactive panel's children instead of hiding them. */
  unmount?: boolean;
  className?: string;
  children?: ReactNode;
}

export function TabPanel({ idPrefix, id, active, unmount = false, className, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      hidden={!active}
      tabIndex={0}
      className={className}
    >
      {unmount && !active ? null : children}
    </div>
  );
}
