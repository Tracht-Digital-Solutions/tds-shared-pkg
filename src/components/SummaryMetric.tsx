import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "../api";
import Skeleton from "./Skeleton";

/** The window event the panel shell's notification poller dispatches. */
export const NOTIFICATION_EVENT = "tds:notification";

export interface SummaryState<T> {
  data: T | null;
  /** The request failed (network, non-2xx or not JSON). */
  failed: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads a dashboard summary (`/x/summary`) through `apiFetch`.
 *
 * `refreshOnModule` reloads whenever the shell announces a notification for
 * that module id, so a tile never shows yesterday's count next to a toast
 * about a new item. A failure is `failed`, never a fake `0`.
 */
export function useSummary<T = Record<string, unknown>>(endpoint: string, refreshOnModule?: string): SummaryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [alive] = useState(() => ({ current: true }));

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as T;
      if (!alive.current) return;
      setData(body);
      setFailed(false);
    } catch {
      if (alive.current) setFailed(true);
    }
  }, [endpoint, alive]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload, alive]);

  useEffect(() => {
    if (!refreshOnModule) return;
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ module?: string }>).detail;
      if (detail?.module === refreshOnModule) void reload();
    };
    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    return () => window.removeEventListener(NOTIFICATION_EVENT, onNotification);
  }, [refreshOnModule, reload]);

  return { data, failed, reload };
}

export interface SummaryMetricProps<T> {
  /** The summary endpoint, e.g. `/documents/summary`. */
  endpoint: string;
  /** The headline value. Default: the response's `count` field. */
  value?: (data: T) => ReactNode;
  /** A `.marginalia` line under the number. */
  caption?: (data: T) => ReactNode;
  /** Anything else under the number (a link, a second figure). */
  children?: (data: T) => ReactNode;
  /** Reload on `tds:notification` for this module id. */
  refreshOnModule?: string;
}

const countOf = (data: unknown): ReactNode => {
  const n = Number((data as { count?: unknown } | null)?.count ?? 0);
  return Number.isFinite(n) ? n : "—";
};

/**
 * The body of a dashboard widget: one big number (`.tds-widget__metric`), a
 * skeleton while it loads (`aria-busy`), `—` when the request failed.
 *
 * Promoted in 0.58 from sixteen extension `WidgetBody` islands. Half of them
 * rendered a failure as `0`, which reads as "nothing to do".
 */
export default function SummaryMetric<T = Record<string, unknown>>({ endpoint, value, caption, children, refreshOnModule }: SummaryMetricProps<T>) {
  const { data, failed } = useSummary<T>(endpoint, refreshOnModule);

  if (data === null && failed) return <p className="tds-widget__metric">—</p>;
  if (data === null) {
    return (
      <p className="tds-widget__metric" aria-busy="true">
        <Skeleton width="3ch" height="1.75rem" />
      </p>
    );
  }

  const metric = <p className="tds-widget__metric">{value ? value(data) : countOf(data)}</p>;
  if (!caption && !children) return metric;
  return (
    <div className="tds-stack">
      {metric}
      {caption ? <p className="marginalia">{caption(data)}</p> : null}
      {children ? children(data) : null}
    </div>
  );
}
