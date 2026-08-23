/**
 * The host-side setup wizard — as a page of the site, not a PHP script.
 *
 * ### Why this is JavaScript
 *
 * `tds-gateway-api/DEPLOY-PLESK.md` configures every frontend subdomain with
 * **PHP disabled** ("rein statische Auslieferung"); only `api.` is a PHP
 * bundle. The previous PHP wizard was therefore served as plain source or a
 * 403 on all four sites and could never have run. This one is a normal page.
 *
 * ### What it can and cannot do
 *
 * A browser cannot write to the docroot, so this does not install anything. It
 * **verifies** the connection, **generates** `tds-runtime.json`, and then
 * **confirms** that the file the operator placed is really live. That last step
 * is what makes the manual placement safe: a missing config is otherwise
 * completely silent — every content fetch on these sites is fail-soft, so the
 * page just renders its baked fallbacks and looks perfectly healthy.
 *
 * What it gains over the PHP version is the thing it was always supposed to
 * measure: the checks now run **on the same path the site itself uses** — same
 * origin, same CORS, same browser. PHP called from the server, which proved
 * something else.
 *
 * ### There is deliberately no login
 *
 * The PHP wizard demanded an admin login because it could WRITE: whoever sets
 * `tds-runtime.json` repoints a public site's whole API surface. This page
 * writes nothing, so a client-side gate would protect nothing — while an
 * unauthenticated password form on a public marketing domain, relaying
 * credentials to the real auth API with no server-side rate limiter, is a
 * phishing and credential-stuffing surface we would be installing on purpose.
 * Everything this page displays is already in the site's own bundle.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_API_BASE, apiBase, type RuntimeConfig } from "../api/index.js";
import {
  buildRuntimeConfig,
  diffPublished,
  probeHealth,
  probeRoute,
  readPublishedConfig,
  serializeRuntimeConfig,
  trimUrl,
  type Endpoints,
  type ProbeResult,
} from "./checks.js";
import type { SiteProfile } from "./profiles.js";

const DEFAULT_LOGIN_URL = "https://auth.tracht-digital.de";

export interface InstallWizardProps {
  profile: SiteProfile;
}

/** One probe, rendered as a row the operator can act on. */
function ProbeRow({ result }: { result: ProbeResult }) {
  const { reachability, status, url, route } = result;
  // `undefined` (never probed a count) and `null` (probed, not an array) both
  // mean "no number to show" here; only a real number distinguishes OK from
  // empty.
  const count = result.count ?? null;

  const unhealthy = result.unhealthy ?? [];
  const isHealth = result.kind === "health";

  const [tone, label] =
    reachability !== "ok"
      ? (["status-pill--danger", "Fehler"] as const)
      : isHealth
        ? unhealthy.length === 0
          ? (["status-pill--success", "OK"] as const)
          : (["status-pill--warning", "Dienste"] as const)
        : count === null
          ? (["status-pill--danger", "Fehler"] as const)
          : count === 0
            ? (["status-pill--warning", "Leer"] as const)
            : (["status-pill--success", "OK"] as const);

  return (
    <li className="tds-list__row">
      <span className={`status-pill ${tone}`}>{label}</span>
      <div>
        <code>{route.path}</code>
        {reachability === "ok" && isHealth && (
          <p className="muted-line">
            {unhealthy.length === 0
              ? "Gateway antwortet, alle Dienste gesund."
              : `Gateway antwortet, aber diese Dienste nicht: ${unhealthy.join(", ")}. Status 0 ist typischerweise eine fehlerhafte .env, die den Dienst beim Start killt.`}
          </p>
        )}
        {reachability === "ok" && !isHealth && count !== null && (
          <p className="muted-line">
            {count} × <code>{route.countKey}</code>
            {count === 0 && " — erreichbar, aber ohne Inhalte. Die Site zeigt hier ihre statischen Platzhalter."}
          </p>
        )}
        {reachability === "ok" && !isHealth && count === null && (
          <p className="muted-line">
            Antwort enthält kein <code>{route.countKey}</code> — unerwartetes Format.
          </p>
        )}
        {reachability === "http-error" && <p className="muted-line">HTTP {status} auf {url}</p>}
        {reachability === "blocked" && (
          <p className="muted-line">
            Nicht erreichbar: <code>{url}</code>.{" "}
            {/* The browser refuses to say why. Naming all three causes beats
                guessing one — a wrong guess sends someone to fix the wrong
                thing, which is worse than an honest "one of these". */}
            Der Browser nennt den Grund nicht — es kann CORS, das Netz oder der
            Host sein.
            {result.hint === "host-reachable" &&
              " Ein Verbindungstest ohne CORS kam allerdings durch: der Host antwortet, also spricht viel für eine fehlende CORS-Freigabe dieses Origins."}
            {result.hint === "host-unreachable" &&
              " Auch ein Verbindungstest ohne CORS kam nicht durch: eher Netz, DNS, TLS oder ein toter Host als CORS."}
          </p>
        )}
      </div>
    </li>
  );
}

export default function InstallWizard({ profile }: InstallWizardProps) {
  const [endpoints, setEndpoints] = useState<Endpoints>({
    apiBase: DEFAULT_API_BASE,
    authBase: `${DEFAULT_API_BASE}/auth`,
    loginUrl: DEFAULT_LOGIN_URL,
  });
  const [loaded, setLoaded] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [published, setPublished] = useState<RuntimeConfig | null>(null);
  const [verified, setVerified] = useState<"idle" | "match" | "mismatch" | "missing">("idle");
  const [copied, setCopied] = useState(false);

  // Prefill from whatever this site is ACTUALLY using, not from the defaults —
  // on a host that already ran the wizard, the form should show the live values
  // so an operator changing one thing does not silently reset the others.
  //
  // Through `readPublishedConfig()`, not `runtimeConfig()`: the same stale-404
  // problem applies here. Somebody who just placed the file and reloaded would
  // otherwise be shown the baked defaults, overwrite their own configuration
  // with them, and never know why.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const live = await readPublishedConfig();
      if (cancelled) return;
      setEndpoints((current) => ({
        apiBase: live?.apiBase ?? apiBase() ?? current.apiBase,
        authBase: live?.authBase ?? `${live?.apiBase ?? apiBase() ?? current.apiBase}/auth`,
        loginUrl: live?.loginUrl ?? current.loginUrl,
      }));
      setPublished(live);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const config = useMemo(() => buildRuntimeConfig(profile, endpoints), [profile, endpoints]);
  const json = useMemo(() => serializeRuntimeConfig(config), [config]);

  const probeBase = profile.probeBase === "auth" ? endpoints.authBase : endpoints.apiBase;

  const runChecks = useCallback(async () => {
    setChecking(true);
    setProbes(null);
    try {
      const health = await probeHealth(endpoints.apiBase);
      const routes: ProbeResult[] = [];
      for (const route of profile.publicRoutes) {
        routes.push(await probeRoute(probeBase, route));
      }
      setProbes([health, ...routes]);
    } finally {
      setChecking(false);
    }
  }, [endpoints.apiBase, probeBase, profile.publicRoutes]);

  const verify = useCallback(async () => {
    const actual = await readPublishedConfig();
    setPublished(actual);
    if (actual === null) {
      setVerified("missing");
      return;
    }
    setVerified(diffPublished(profile, config, actual).length === 0 ? "match" : "mismatch");
  }, [profile, config]);

  const download = useCallback(() => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tds-runtime.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [json]);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [json]);

  const set = (key: keyof Endpoints) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setEndpoints((current) => ({ ...current, [key]: value }));
    setVerified("idle");
  };

  const otherOrigins = profile.origins.filter(
    (origin) => typeof window !== "undefined" && origin !== window.location.origin,
  );

  return (
    <div className="tds-page tds-stack">
      <div className="tds-stack tds-stack--tight">
        <h1 className="tds-page__title">Einrichtung — {profile.name}</h1>
        <p className="tds-page__lede">
          Verbindet diese ausgelieferte Site mit der API. Die Prüfungen laufen in
          diesem Browser und damit auf genau dem Weg, den die Site selbst nimmt.
        </p>
      </div>

      <section className="tds-card tds-stack p-5">
        <h2>1. Endpunkte</h2>
        <div className="tds-field-row">
          <label htmlFor="apiBase">API-Basis-URL (das Gateway)</label>
          <input id="apiBase" className="field field-boxed" value={endpoints.apiBase} onChange={set("apiBase")} />
        </div>

        <div className="tds-field-row">
          <label htmlFor="authBase">Auth-API-URL</label>
          <input id="authBase" className="field field-boxed" value={endpoints.authBase} onChange={set("authBase")} />
        </div>

        {profile.runtimeKeys.includes("loginUrl") && (
          <div className="tds-field-row">
            <label htmlFor="loginUrl">Login-Seite</label>
            <input id="loginUrl" className="field field-boxed" value={endpoints.loginUrl} onChange={set("loginUrl")} />
          </div>
        )}

        {!loaded && <p className="muted-line">Aktuelle Konfiguration wird gelesen …</p>}
      </section>

      <section className="tds-card tds-stack p-5">
        <h2>2. Verbindung prüfen</h2>
        <div className="tds-row">
          <button type="button" className="btn btn-primary" onClick={() => void runChecks()} disabled={checking}>
            {checking ? "Prüft …" : "Prüfen"}
          </button>
        </div>

        {probes !== null && (
          <ul className="tds-list">
            {probes.map((result) => (
              <ProbeRow key={result.url} result={result} />
            ))}
          </ul>
        )}

        {otherOrigins.length > 0 && (
          <p className="tds-alert">
            {/* ONE child: .tds-alert is a flex row with a gap, so every text
                node and <code> would otherwise become its own flex item and
                stack into vertical columns. */}
            <span>
              Diese Seite kann nur das Origin prüfen, auf dem sie geladen ist.
              Für {otherOrigins.join(", ")} bitte dort <code>/install</code>{" "}
              öffnen und erneut prüfen — eine fehlende CORS-Freigabe ist von
              hier aus nicht sichtbar.
            </span>
          </p>
        )}
      </section>

      <section className="tds-card tds-stack p-5">
        <h2>3. Konfiguration erzeugen</h2>
        <p>
          Diese Datei gehört als <code>tds-runtime.json</code> in den Docroot,
          neben die <code>index.html</code>. Ein erneuter Deploy überschreibt sie
          nicht.
        </p>
        <pre className="field-boxed p-3 overflow-x-auto text-sm">{json}</pre>
        <div className="tds-row">
          <button type="button" className="btn btn-primary" onClick={download}>
            Herunterladen
          </button>
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? "Kopiert" : "JSON kopieren"}
          </button>
        </div>
      </section>

      <section className="tds-card tds-stack p-5">
        <h2>4. Bestätigen</h2>
        <p>
          Nach dem Ablegen hier prüfen, ob die Datei wirklich ausgeliefert wird.
          Ohne diesen Schritt bleibt eine fehlende Konfiguration unsichtbar: die
          Site fällt still auf ihre gebackenen Werte zurück.
        </p>
        <div className="tds-row">
          <button type="button" className="btn btn-primary" onClick={() => void verify()}>
            Prüfen, ob die Datei liegt
          </button>
        </div>

        {verified === "match" && (
          <p className="tds-alert tds-alert--success">
            <span>
              <code>tds-runtime.json</code> wird ausgeliefert und stimmt mit dem
              Erzeugten überein.
            </span>
          </p>
        )}
        {verified === "missing" && (
          <p className="tds-alert tds-alert--danger">
            <span>
              Keine <code>tds-runtime.json</code> erreichbar. Die Site benutzt
              weiterhin die einkompilierten Werte.
            </span>
          </p>
        )}
        {verified === "mismatch" && (
          <p className="tds-alert tds-alert--warning">
            <span>
              Es liegt eine <code>tds-runtime.json</code>, sie unterscheidet
              sich aber in: {diffPublished(profile, config, published).join(", ")}.
              Vermutlich eine ältere Fassung — bitte ersetzen.
            </span>
          </p>
        )}
      </section>

      {profile.registrySync && <RegistrySync apiBase={endpoints.apiBase} />}
    </div>
  );
}

/**
 * Push the built tool catalog to the admin panel.
 *
 * The tools site publishes `dist/tools-catalog.json`; `POST /tools/registry`
 * ingests it. The build was supposed to do this, but no workflow ever exported
 * a token and a non-`PUBLIC_` key never reaches `import.meta.env` anyway, so it
 * has never run once — `tools_config` stays empty while the panel tells the
 * operator to wait.
 *
 * The token goes straight into the request and is never stored. It already
 * passed through a browser form in the PHP version; only the outbound call
 * moved. Store it under *Einstellungen → Tools* FIRST — `/tools/registry`
 * answers **503** until it exists, and that error points nowhere near the cause.
 */
function RegistrySync({ apiBase: base }: { apiBase: string }) {
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ tone: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(async () => {
    setBusy(true);
    setState(null);
    try {
      const catalogRes = await fetch("/tools-catalog.json", { cache: "no-store" });
      if (!catalogRes.ok) {
        setState({ tone: "tds-alert--danger", text: "tools-catalog.json nicht gefunden — wurde die Site gebaut?" });
        return;
      }
      const doc: unknown = await catalogRes.json();
      const tools = Array.isArray(doc) ? doc : ((doc as { tools?: unknown[] }).tools ?? []);

      const res = await fetch(`${trimUrl(base)}/tools/registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, tools }),
      });
      if (res.status === 401) {
        setState({ tone: "tds-alert--danger", text: "Token abgelehnt (401)." });
        return;
      }
      if (res.status === 503) {
        setState({
          tone: "tds-alert--warning",
          text: "Die Registry ist noch nicht konfiguriert (503). Zuerst unter Einstellungen → Tools ein Registry-Sync-Token speichern.",
        });
        return;
      }
      if (!res.ok) {
        setState({ tone: "tds-alert--danger", text: `Fehlgeschlagen (HTTP ${res.status}).` });
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as { count?: number };
      setState({
        tone: "tds-alert--success",
        text: `Übertragen: ${payload.count ?? tools.length} Tools.`,
      });
    } catch {
      setState({
        tone: "tds-alert--danger",
        text: "Nicht erreichbar — CORS, Netz oder Host; der Browser nennt den Grund nicht.",
      });
    } finally {
      setBusy(false);
    }
  }, [base, token]);

  return (
    <section className="tds-card tds-stack p-5">
      <h2>5. Tool-Katalog übertragen</h2>
      <p>
        Überträgt die gebauten Tools an <code>POST /tools/registry</code>, damit
        sie im Admin-Panel erscheinen. Das Token vorher unter{" "}
        <em>Einstellungen → Tools</em> speichern, sonst antwortet die Registry
        mit 503.
      </p>
      <div className="tds-field-row">
        <label htmlFor="registryToken">Registry-Sync-Token</label>
        <input
          id="registryToken"
          className="field field-boxed"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="tds-row">
        <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={busy || token === ""}>
          {busy ? "Überträgt …" : "Übertragen"}
        </button>
      </div>
      {state !== null && (
        <p className={`tds-alert ${state.tone}`}>
          <span>{state.text}</span>
        </p>
      )}
    </section>
  );
}
