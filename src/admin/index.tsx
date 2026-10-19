import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, describeFailure, sendJson } from "../api";
import { toast } from "../toast";

/**
 * Panel admin building blocks that extensions had copied from each other:
 * the runtime-settings section (11 copies) and the public-site pairing flow
 * (4 copies). Promoted in 0.58. React, no motion; panel islands only.
 */

/* === Runtime settings: `/admin/settings/<namespace>` ==================== */

/** One setting as the core store returns it. Secrets come back masked. */
export interface MaskedSetting {
  key: string;
  secret: boolean;
  configured?: boolean;
  last4?: string | null;
  value?: string;
}

/** What a save sends. A blank `value` on a secret keeps the stored one. */
export interface SettingInput {
  key: string;
  secret?: boolean;
  value: string;
}

/** `konfiguriert (…1234)` / `nicht konfiguriert` — the hint beside a secret field. */
export function secretHint(setting: MaskedSetting | null | undefined): string {
  return setting?.configured ? `konfiguriert (…${setting.last4 ?? "????"})` : "nicht konfiguriert";
}

export interface RuntimeSettings {
  loaded: boolean;
  /** The load failure, for an in-flow alert. */
  error: string | null;
  settings: ReadonlyMap<string, MaskedSetting>;
  get: (key: string) => MaskedSetting | undefined;
  /** A plain setting's stored value, or `fallback` when unset or empty. */
  value: (key: string, fallback?: string) => string;
  busy: boolean;
  /** PUTs the inputs, toasts the outcome, reloads on success. Resolves `true` on success. */
  save: (inputs: SettingInput[], successText?: string) => Promise<boolean>;
  reload: () => Promise<void>;
}

/**
 * Loads and saves one namespace of the core runtime settings store
 * (`/admin/settings/<namespace>`, admin-only). A 401/403 reads "Nur für
 * Administratoren."; a request that never reaches the API is an in-flow
 * error on load and a toast on save, never a spinner that stays forever.
 */
export function useRuntimeSettings(namespace: string): RuntimeSettings {
  const path = `/admin/settings/${namespace}`;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReadonlyMap<string, MaskedSetting>>(new Map());
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const res = await apiFetch(path).catch(() => null);
    if (!alive.current) return;
    if (res === null || !res.ok) {
      setError(describeFailure(res, "Einstellungen konnten nicht geladen werden", { adminOnly: true }));
      setLoaded(true);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { settings?: MaskedSetting[] };
    if (!alive.current) return;
    setSettings(new Map((body.settings ?? []).map((s) => [s.key, s])));
    setError(null);
    setLoaded(true);
  }, [path]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  const save = useCallback(
    async (inputs: SettingInput[], successText = "Gespeichert.") => {
      setBusy(true);
      const res = await sendJson(path, "PUT", {
        settings: inputs.map((s) => ({ key: s.key, secret: s.secret ?? false, value: s.value })),
      }).catch(() => null);
      if (alive.current) setBusy(false);
      if (res === null || !res.ok) {
        toast.danger(describeFailure(res, "Speichern fehlgeschlagen", { adminOnly: true }));
        return false;
      }
      toast.success(successText);
      await reload();
      return true;
    },
    [path, reload],
  );

  return {
    loaded,
    error,
    settings,
    get: (key) => settings.get(key),
    value: (key, fallback = "") => settings.get(key)?.value || fallback,
    busy,
    save,
    reload,
  };
}

export interface SecretFieldProps {
  label: string;
  /** The masked setting, for the "konfiguriert (…1234)" hint. */
  setting: MaskedSetting | null | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A write-only secret input. The stored value never round-trips to the UI:
 * the label shows whether one is set, the field starts empty, and an empty
 * field on save keeps the stored secret.
 */
export function SecretField({ label, setting, value, onChange, placeholder = "Neuen Wert setzen (leer = behalten)", disabled }: SecretFieldProps) {
  return (
    <label className="block">
      <span className="text-sm">
        {label} <em className="opacity-60">({secretHint(setting)})</em>
      </span>
      <input
        className="field-boxed"
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
      />
    </label>
  );
}

/* === Public-site pairing: `<base>/connection` ========================== */

/** The stored connection of one public site. */
export interface SiteConnection {
  origin?: string | null;
  connected?: boolean;
  [field: string]: unknown;
}

export interface PairingOptions {
  /** The owning resource, e.g. `/blogs/journal` or `/tools`. Routes hang below it. */
  base: string;
  /** The pairing profile the API expects (`blog`, `website`, `tools`, `cards`). */
  profile: string;
  /** How the site is named in messages: "Der Blog", "Die Website". */
  subject: string;
}

export interface Pairing {
  connection: SiteConnection | null;
  loading: boolean;
  connecting: boolean;
  /** The last problem, for an in-flow alert. */
  status: string | null;
  /** The fallback setup link when the site did not accept the hand-over directly. */
  installUrl: string | null;
  /** Site keys the API offered when the binding was ambiguous (422). */
  candidates: string[] | null;
  connect: (origin: string, bindings?: Record<string, string>) => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  rebuildCache: () => Promise<boolean>;
  reload: () => Promise<void>;
}

const reasonOf = (body: Record<string, unknown>): string | null =>
  typeof body.error === "string" && body.error.trim() !== "" ? body.error.trim() : null;

/**
 * Loads, creates and removes the API connection of one public site, and asks
 * it to rebuild its page cache. The UI (fields, buttons, the confirm before a
 * disconnect) stays in the island; this owns the requests and their wording.
 */
export function usePairing({ base, profile, subject }: PairingOptions): Pairing {
  const [connection, setConnection] = useState<SiteConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch(`${base}/connection`);
      if (res.status === 404) setConnection(null);
      else if (res.ok) {
        const body = (await res.json()) as { connection?: SiteConnection } & SiteConnection;
        setConnection((body.connection ?? body) as SiteConnection);
      } else setStatus(`Verbindungsstatus konnte nicht geladen werden (HTTP ${res.status}).`);
    } catch {
      setStatus("Verbindungsstatus konnte nicht geladen werden (Netzwerkfehler).");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const connect = useCallback(
    async (origin: string, bindings: Record<string, string> = {}) => {
      setConnecting(true);
      setStatus(null);
      setInstallUrl(null);
      try {
        const res = await sendJson(`${base}/connection/pairing`, "POST", { origin: origin.trim(), profile, bindings });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          if (Array.isArray(body.candidates)) setCandidates(body.candidates.map(String));
          // The API names the cause (a missing SETTINGS_ENCRYPTION_KEY, a server
          // fault) — for an operator without log access, the only diagnosis.
          const reason = reasonOf(body);
          setStatus(
            res.status === 422
              ? (reason ?? "Bitte eine reine HTTPS-Adresse und bei mehreren Websites den passenden Website-Schlüssel angeben.")
              : `Verbinden fehlgeschlagen (HTTP ${res.status})${reason ? `: ${reason}` : "."}`,
          );
          return false;
        }
        const link = (body.fallback_url ?? body.install_url ?? null) as string | null;
        setInstallUrl(link);
        if (body.delivered === true || body.connected === true) {
          toast.success(`${subject} ist mit der API verbunden.`);
          await reload();
          return true;
        }
        // `error` is why the hand-over failed — the site's own refusal, which
        // otherwise only its log would show.
        const reason = reasonOf(body);
        setStatus(
          `${subject} hat die Verbindung nicht direkt angenommen${reason ? ` (${reason})` : ""}. Öffnen Sie den Einrichtungslink auf dem Server.`,
        );
        return false;
      } catch {
        setStatus("Verbinden fehlgeschlagen (Netzwerkfehler).");
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [base, profile, subject, reload],
  );

  const disconnect = useCallback(async () => {
    const res = await apiFetch(`${base}/connection`, { method: "DELETE" }).catch(() => null);
    if (res === null || !res.ok) {
      toast.danger(describeFailure(res, "Trennen fehlgeschlagen"));
      return false;
    }
    setConnection(null);
    setInstallUrl(null);
    toast.success("Verbindung getrennt.");
    return true;
  }, [base]);

  const rebuildCache = useCallback(async () => {
    setStatus(null);
    const res = await sendJson(`${base}/cache/rebuild`, "POST", {}).catch(() => null);
    if (res !== null && res.ok) {
      toast.success("Cache-Neubau wurde angefragt.");
      return true;
    }
    if (res?.status === 422) setStatus("Die gespeicherte Website-Adresse ist ungültig.");
    else if (res?.status === 503) setStatus(`${subject} ist noch nicht vollständig mit der API verbunden.`);
    else if (res?.status === 502) setStatus(`${subject} ist erreichbar, aber der Cache-Neubau ist fehlgeschlagen. Bitte erneut versuchen.`);
    else toast.danger(describeFailure(res, "Cache-Neubau fehlgeschlagen"));
    return false;
  }, [base, subject]);

  return { connection, loading, connecting, status, installUrl, candidates, connect, disconnect, rebuildCache, reload };
}
