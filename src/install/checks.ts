/**
 * The wizard's logic, with no DOM and no React in sight.
 *
 * Everything here is either a pure function or a single `fetch` — which is what
 * lets the interesting parts be tested directly. The React island above it is
 * presentation.
 */

import { RUNTIME_CONFIG_PATH, type RuntimeConfig, type RuntimeKey } from "../api/index.js";
import type { PublicRoute, SiteProfile } from "./profiles.js";

/** Trailing slashes are the single most common paste error in a base-URL field. */
export const trimUrl = (value: string): string => value.trim().replace(/\/+$/, "");

/**
 * The length of the array at a dotted path, or `null` if it is not an array.
 *
 * Ported from the PHP `count_items()` verbatim, including the `null` for a
 * missing or non-array node — "unerwartete Antwort" and "0 Einträge" are
 * different findings and must not collapse into each other.
 */
export function countItems(payload: unknown, key: string): number | null {
  let node: unknown = payload;
  for (const segment of key.split(".")) {
    if (node === null || typeof node !== "object" || !(segment in node)) return null;
    node = (node as Record<string, unknown>)[segment];
  }
  return Array.isArray(node) ? node.length : null;
}

/** What the operator typed into step 1. */
export interface Endpoints {
  apiBase: string;
  authBase: string;
  loginUrl: string;
}

/**
 * Build the `tds-runtime.json` body for a profile.
 *
 * The counterpart of the PHP `runtime_config()`. It emits EXACTLY the profile's
 * `runtimeKeys` — never more. A key a site does not read is noise in a file an
 * operator has to eyeball, and a key it reads but never gets falls back to the
 * baked value without a word.
 *
 * `mode` is always `"direct"` now. It stays in the shape because a host may
 * still carry a hand-written file from when the same-origin proxy existed, and
 * `runtimeAbsolute()` in `src/api` reads such a file defensively.
 */
export function buildRuntimeConfig(profile: SiteProfile, endpoints: Endpoints): RuntimeConfig {
  const api = trimUrl(endpoints.apiBase);
  const all: Record<RuntimeKey, string> = {
    apiBase: api,
    authBase: trimUrl(endpoints.authBase),
    loginUrl: trimUrl(endpoints.loginUrl),
    contactUrl: `${api}/contact`,
    liveChatFrontend: profile.id,
  };

  const out: RuntimeConfig = {
    version: 1,
    site: profile.id,
    mode: "direct",
    generatedAt: new Date().toISOString(),
  };
  for (const key of profile.runtimeKeys) out[key] = all[key];
  return out;
}

/** Pretty JSON, exactly as it should land on the host. */
export const serializeRuntimeConfig = (config: RuntimeConfig): string =>
  `${JSON.stringify(config, null, 2)}\n`;

/**
 * Why a cross-origin request failed — as far as a browser can honestly tell.
 *
 * `"blocked"` is deliberately one bucket. A failed cross-origin `fetch` rejects
 * with a bare `TypeError` that carries no reason: a DNS failure, a TLS error, a
 * dead host and a CORS rejection are indistinguishable, and the browser will
 * not say which. The PHP wizard could tell them apart because it called from
 * the server. This one must not pretend to.
 */
export type Reachability = "ok" | "http-error" | "blocked";

export interface ProbeResult {
  /**
   * `"health"` is `/healthz`, which is shaped differently from a content
   * route: its `services` is a MAP of name to info, not a list, so there is
   * nothing to count. Treating it as a content route reported a perfectly
   * healthy gateway as "unerwartetes Format".
   */
  kind: "health" | "content";
  route: PublicRoute;
  url: string;
  reachability: Reachability;
  status?: number;
  count?: number | null;
  /** Set only when a `no-cors` probe narrowed a `"blocked"` down. See below. */
  hint?: "host-reachable" | "host-unreachable";
  /**
   * Composed services the gateway reports as unhealthy, `"name (status)"`.
   *
   * A service at status `0` is the signature of a malformed `.env` killing it
   * at boot — invisible otherwise, and worth naming: the gateway itself answers
   * a cheerful 200 while the service behind it is dead.
   */
  unhealthy?: string[];
}

/**
 * Does the host answer at all, ignoring CORS?
 *
 * A `no-cors` request returns an opaque response: no status, no headers, no
 * body. Resolving therefore proves only that something completed the round
 * trip — which is exactly the one bit that separates "CORS rejected us" from
 * "nothing is there". It is an INDICATION, not a verdict: an opaque response
 * cannot distinguish a 200 from a 500, and a captive portal or an intercepting
 * proxy will also resolve it. The wizard words it accordingly.
 */
async function hostAnswers(url: string): Promise<boolean> {
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store" });
    return true;
  } catch {
    return false;
  }
}

/** Run one profile route and report what actually happened. */
export async function probeRoute(base: string, route: PublicRoute): Promise<ProbeResult> {
  const url = `${trimUrl(base)}${route.path}`;
  try {
    const res = await fetch(url, { method: route.method, headers: { Accept: "application/json" } });
    if (!res.ok) return { kind: "content", route, url, reachability: "http-error", status: res.status };

    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("json")) {
      // A static host answers unknown paths with its SPA fallback — 200 plus
      // HTML — so `res.ok` alone proves nothing about what answered.
      return { kind: "content", route, url, reachability: "http-error", status: res.status, count: null };
    }
    return {
      kind: "content",
      route,
      url,
      reachability: "ok",
      status: res.status,
      count: countItems(await res.json(), route.countKey),
    };
  } catch {
    return {
      kind: "content",
      route,
      url,
      reachability: "blocked",
      hint: (await hostAnswers(url)) ? "host-reachable" : "host-unreachable",
    };
  }
}

/**
 * `GET {apiBase}/healthz`.
 *
 * Not a content route: `services` is a map of name to info, so there is no
 * array to count. What it can say instead is WHICH composed service is
 * unhealthy — the gateway answers 200 either way, so a dead service behind it
 * is otherwise completely invisible from outside.
 */
export async function probeHealth(apiBase: string): Promise<ProbeResult> {
  const route: PublicRoute = { method: "GET", path: "/healthz", countKey: "services" };
  const url = `${trimUrl(apiBase)}/healthz`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      return { kind: "health", route, url, reachability: "http-error", status: res.status };
    }
    const body = (await res.json()) as { services?: Record<string, { status?: number }> };
    const unhealthy = Object.entries(body.services ?? {})
      .filter(([, info]) => {
        const status = Number(info?.status ?? 0);
        return status < 200 || status >= 400;
      })
      .map(([name, info]) => `${name} (${info?.status ?? 0})`);
    return { kind: "health", route, url, reachability: "ok", status: res.status, unhealthy };
  } catch {
    return {
      kind: "health",
      route,
      url,
      reachability: "blocked",
      hint: (await hostAnswers(url)) ? "host-reachable" : "host-unreachable",
    };
  }
}

/**
 * Read `tds-runtime.json` back off this site's own origin.
 *
 * Deliberately NOT `runtimeConfig()` from `src/api`: that one memoises for the
 * page's lifetime and sets no cache mode. The operator has just uploaded the
 * file, and the browser may well still be holding the 404 from a minute ago —
 * the check would stay red forever and send someone hunting a bug that is not
 * there.
 */
export async function readPublishedConfig(): Promise<RuntimeConfig | null> {
  try {
    const res = await fetch(`${RUNTIME_CONFIG_PATH}?t=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("json")) return null;
    const parsed: unknown = await res.json();
    return parsed !== null && typeof parsed === "object" ? (parsed as RuntimeConfig) : null;
  } catch {
    return null;
  }
}

/**
 * Which configured values on the host differ from what the wizard produced.
 *
 * Compares only the keys the profile actually publishes, and ignores
 * `generatedAt` — re-running the wizard changes it every time, and reporting
 * that as a mismatch would train the operator to ignore this check.
 */
export function diffPublished(
  profile: SiteProfile,
  expected: RuntimeConfig,
  actual: RuntimeConfig | null,
): RuntimeKey[] {
  if (actual === null) return [...profile.runtimeKeys];
  return profile.runtimeKeys.filter((key) => actual[key] !== expected[key]);
}
