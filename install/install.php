<?php

declare(strict_types=1);

/**
 * TDS — Setup-Assistent für die öffentlichen Frontends
 * ====================================================
 *
 * One installer, three sites: `tds-landingpage-frontend`, `tds-blog-frontend`
 * and `tds-tools-frontend`. It is maintained HERE, in `tds-shared-pkg/install/`,
 * and copied into each site's `public/_setup/` by that repo's
 * `scripts/sync-installer.mjs` (a `prebuild` step). Astro copies `public/`
 * verbatim into `dist/`, `_build.yml` force-pushes `dist/` onto the orphan
 * `release` branch, and Plesk pulls it — so the installer reaches the host with
 * no pipeline change at all.
 *
 * ### What it is for
 *
 * The three sites are static Astro builds. Every API URL they use is inlined by
 * Vite AT BUILD TIME, so a deployed `dist/` cannot be re-pointed at another API
 * without a CI rebuild — and, worse, a site that cannot reach the API at all
 * fails silently: all content fetches are deliberately fail-soft, so the page
 * calmly renders its static fallbacks. No error, no log, nothing goes red.
 *
 * This wizard closes both gaps. It
 *
 *   1. verifies the connection with real assertions ("12 Blöcke", not "HTTP 200"),
 *   2. runs a CORS preflight per origin with the site's real `Origin` header,
 *   3. writes `tds-runtime.json`, which `@tracht-digital-solutions/tds-shared/api`
 *      reads at runtime and prefers over the baked build value, and
 *   4. optionally installs a same-origin PHP proxy under `/api/*`, so the browser
 *      calls need no CORS at all and a site token stays server-side.
 *
 * ### Why it is protected differently than the gateway's installer
 *
 * `tds-gateway-api/public/install.php` guards itself with "not yet installed"
 * plus a self-delete button. Neither works here:
 *
 *   - These sites are PUBLIC and INDEXABLE. `tracht-digital.de` is the marketing
 *     site; an unprotected wizard sitting there during the window between deploy
 *     and first run is a real hole, not a theoretical one.
 *   - Self-deleting is pointless: the file is part of `dist/`, so the very next
 *     release puts it straight back.
 *
 * So the wizard requires a platform admin login against `tds-auth-api` before it
 * will show a configuration form, rate-limits those attempts on disk, sends
 * `X-Robots-Tag: noindex`, and once finished locks itself into a read-only
 * diagnosis mode via `_setup/.tds-site-installed`.
 *
 * @see tds-gateway-api/public/install.php  the backend twin this mirrors
 */

session_start();

// Belt and braces: the meta tag below covers browsers, this covers the crawlers
// that read headers only. `public/robots.txt` disallows /_setup/ as well.
header('X-Robots-Tag: noindex, nofollow', true);

$SETUP_DIR = __DIR__;                 // <docroot>/_setup
$DOCROOT   = dirname(__DIR__);        // <docroot> — the deployed dist/
$LOCK_FILE = $SETUP_DIR . '/.tds-site-installed';
$ATTEMPTS  = $SETUP_DIR . '/.tds-login-attempts';

/** Sessions live under their own key so a gateway install on the same host cannot collide. */
const SESSION_KEY = 'tds_site_install';

/** An admin login is good for this long before the wizard asks again. */
const AUTH_TTL_SECONDS = 1800;

/** Failed logins allowed per {@see LOGIN_WINDOW_SECONDS}. Mirrors tds-auth-api's own limiter. */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 600;

// --- micro helpers -----------------------------------------------------------

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
}

/** URL-safe random token. 24 bytes ≈ 32 chars, 32 bytes ≈ 43. */
function token(int $bytes = 24): string
{
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function post(string $k, string $default = ''): string
{
    return isset($_POST[$k]) ? trim((string) $_POST[$k]) : $default;
}

function cfg(string $k, string $default = ''): string
{
    return (string) ($_SESSION[SESSION_KEY][$k] ?? $default);
}

/** @param array<string,string> $kv */
function set_cfg(array $kv): void
{
    $_SESSION[SESSION_KEY] = array_merge($_SESSION[SESSION_KEY] ?? [], $kv);
}

/** Trailing slashes are the single most common paste error in a base-URL field. */
function trim_url(string $url): string
{
    return rtrim(trim($url), '/');
}

// --- .env-style escaping ------------------------------------------------------

/**
 * Render one `KEY="value"` line with every value quoted and escaped.
 *
 * Copied verbatim from `tds-gateway-api/public/install.php:133` — including the
 * reason, which cost a day of debugging there: phpdotenv rejects an unquoted
 * value containing spaces, and it INTERPOLATES `${VAR}` inside double quotes, so
 * an unescaped `$` in a generated token is silently rewritten. This installer
 * generates tokens with `token()`, whose base64url alphabet has no `$` — but the
 * operator can paste any registry token they like into the form.
 *
 * {@see read_env_kv()} is the exact inverse; change one, change the other.
 */
function env_line(string $key, string $value): string
{
    $v = str_replace(["\r", "\n"], '', $value);
    $v = str_replace('\\', '\\\\', $v);
    $v = str_replace('"', '\\"', $v);
    $v = str_replace('$', '\\$', $v);

    return $key . '="' . $v . '"' . "\n";
}

/** @param array<string,string> $pairs */
function env_body(array $pairs): string
{
    $out = '';
    foreach ($pairs as $k => $v) {
        $out .= env_line($k, (string) $v);
    }

    return $out;
}

/**
 * The exact inverse of {@see env_line()}.
 *
 * Only used to re-read an existing secrets file so a re-run can keep a token the
 * operator does not want to retype.
 *
 * @return array<string,string>
 */
function read_env_kv(string $file): array
{
    $out = [];
    if (!is_file($file)) {
        return $out;
    }
    foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $pos = strpos($line, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($line, 0, $pos));
        $val = trim(substr($line, $pos + 1));
        $len = strlen($val);
        if ($len >= 2 && $val[0] === '"' && $val[$len - 1] === '"') {
            $val = str_replace(['\\\\', '\\"', '\\$'], ['\\', '"', '$'], substr($val, 1, -1));
        } elseif ($len >= 2 && $val[0] === "'" && $val[$len - 1] === "'") {
            $val = substr($val, 1, -1); // single-quoted is literal
        }
        $out[$key] = $val;
    }

    return $out;
}

// --- profile ------------------------------------------------------------------

/**
 * Load the site profile written next to this file by `sync-installer.mjs`.
 *
 * The package ships all three under `install/profiles/`; the sync step copies
 * exactly one to `_setup/profile.php`, so the installer never has to guess which
 * site it is running on.
 *
 * @return array<string,mixed>|null
 */
function load_profile(string $setupDir): ?array
{
    $file = $setupDir . '/profile.php';
    if (!is_file($file)) {
        return null;
    }
    /** @var mixed $profile */
    $profile = require $file;

    return is_array($profile) && isset($profile['id']) ? $profile : null;
}

// --- HTTP ---------------------------------------------------------------------

/**
 * One HTTP call, cURL when available and streams otherwise.
 *
 * Returns `[status, headers, body, error]`. A transport failure is `status = 0`
 * plus a non-empty `error`; it never throws, because every caller here wants to
 * REPORT the failure rather than abort the wizard.
 *
 * @param array{method?:string,headers?:array<string,string>,body?:string,timeout?:int} $opts
 * @return array{0:int,1:array<string,string>,2:string,3:string}
 */
function http_request(string $url, array $opts = []): array
{
    $method  = strtoupper($opts['method'] ?? 'GET');
    $headers = $opts['headers'] ?? [];
    $body    = $opts['body'] ?? null;
    $timeout = $opts['timeout'] ?? 12;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $flat = [];
        foreach ($headers as $k => $v) {
            $flat[] = $k . ': ' . $v;
        }
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER         => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $flat,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => min(8, $timeout),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);

            return [0, [], '', $err !== '' ? $err : 'Verbindung fehlgeschlagen.'];
        }
        $status   = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        return [$status, parse_headers(substr((string) $raw, 0, $headSize)), substr((string) $raw, $headSize), ''];
    }

    if (!ini_get('allow_url_fopen')) {
        return [0, [], '', 'Weder cURL noch allow_url_fopen verfügbar.'];
    }

    $flat = '';
    foreach ($headers as $k => $v) {
        $flat .= $k . ': ' . $v . "\r\n";
    }
    $ctx = stream_context_create(['http' => [
        'method'        => $method,
        'header'        => $flat,
        'content'       => $body ?? '',
        'timeout'       => $timeout,
        'ignore_errors' => true, // 4xx/5xx must come back as a response, not false
    ]]);
    $out = @file_get_contents($url, false, $ctx);
    if ($out === false) {
        return [0, [], '', 'Verbindung fehlgeschlagen.'];
    }
    /** @var list<string> $http_response_header */
    $lines  = $http_response_header ?? [];
    $status = 0;
    if (isset($lines[0]) && preg_match('#\s(\d{3})\s#', $lines[0] . ' ', $m)) {
        $status = (int) $m[1];
    }

    return [$status, parse_headers(implode("\r\n", $lines)), $out, ''];
}

/**
 * Lower-cased header map. Only the LAST value of a repeated header survives,
 * which is fine for everything read here (`access-control-allow-origin`,
 * `content-type`).
 *
 * @return array<string,string>
 */
function parse_headers(string $raw): array
{
    $out = [];
    foreach (preg_split('/\r?\n/', $raw) ?: [] as $line) {
        $pos = strpos($line, ':');
        if ($pos === false) {
            continue;
        }
        $out[strtolower(trim(substr($line, 0, $pos)))] = trim(substr($line, $pos + 1));
    }

    return $out;
}

/** @return array<mixed>|null */
function json_body(string $body): ?array
{
    /** @var mixed $decoded */
    $decoded = json_decode($body, true);

    return is_array($decoded) ? $decoded : null;
}

/**
 * Count the items a public read route actually returned.
 *
 * This is the whole point of the content smoke test: every one of these routes
 * degrades to an empty payload rather than an error (deliberately — an SSG build
 * must not break on an API hiccup), so "HTTP 200" says nothing at all about
 * whether the site will have content. `$key` names the collection to count;
 * a dotted path is supported for nested shapes.
 */
function count_items(?array $payload, string $key): ?int
{
    if ($payload === null) {
        return null;
    }
    /** @var mixed $node */
    $node = $payload;
    foreach (explode('.', $key) as $segment) {
        if (!is_array($node) || !array_key_exists($segment, $node)) {
            return null;
        }
        /** @var mixed $node */
        $node = $node[$segment];
    }

    return is_array($node) ? count($node) : null;
}

// --- login rate limit ---------------------------------------------------------

/** @return list<int> */
function recent_attempts(string $file): array
{
    $raw = is_file($file) ? (string) @file_get_contents($file) : '';
    /** @var mixed $decoded */
    $decoded = json_decode($raw, true);
    $cutoff = time() - LOGIN_WINDOW_SECONDS;
    $out = [];
    foreach (is_array($decoded) ? $decoded : [] as $ts) {
        if (is_int($ts) && $ts > $cutoff) {
            $out[] = $ts;
        }
    }

    return $out;
}

function record_attempt(string $file): void
{
    $all = recent_attempts($file);
    $all[] = time();
    @file_put_contents($file, json_encode($all), LOCK_EX);
}

function clear_attempts(string $file): void
{
    @unlink($file);
}

// --- auth ---------------------------------------------------------------------

/**
 * Authenticate the operator against `tds-auth-api` and require a platform admin.
 *
 * Two calls, deliberately: `POST /login` proves the password, `GET /me` proves
 * the RIGHT. The login response alone does not say whether the account is an
 * admin, and this wizard rewrites how a public site talks to the API — that is
 * not something a customer-portal login should be able to do.
 *
 * The token is used once and discarded; nothing is persisted.
 *
 * @return array{0:bool,1:string}
 */
function verify_admin(string $authBase, string $email, string $password): array
{
    [$status, , $body, $err] = http_request($authBase . '/login', [
        'method'  => 'POST',
        'headers' => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
        'body'    => json_encode(['email' => $email, 'password' => $password]),
        'timeout' => 15,
    ]);
    if ($status === 0) {
        return [false, 'Auth-API nicht erreichbar: ' . $err];
    }
    if ($status === 429) {
        return [false, 'Zu viele Anmeldeversuche — die Auth-API bremst gerade. Bitte später erneut.'];
    }
    if ($status !== 200) {
        return [false, 'Anmeldung fehlgeschlagen (HTTP ' . $status . ').'];
    }
    $payload = json_body($body);
    $token = is_array($payload) && isset($payload['token']) ? (string) $payload['token'] : '';
    if ($token === '') {
        return [false, 'Die Auth-API hat keinen Token geliefert.'];
    }

    [$meStatus, , $meBody] = http_request($authBase . '/me', [
        'headers' => ['Authorization' => 'Bearer ' . $token, 'Accept' => 'application/json'],
        'timeout' => 15,
    ]);
    if ($meStatus !== 200) {
        return [false, 'Konnte das Konto nicht prüfen (HTTP ' . $meStatus . ' auf /me).'];
    }
    $me = json_body($meBody);
    if (!is_array($me) || ($me['isAdmin'] ?? false) !== true) {
        return [false, 'Dieses Konto ist kein Plattform-Administrator.'];
    }

    return [true, (string) ($me['email'] ?? $email)];
}

function is_authed(): bool
{
    $at = (int) ($_SESSION[SESSION_KEY]['authed_at'] ?? 0);

    return ($_SESSION[SESSION_KEY]['authed'] ?? false) === true
        && $at > 0
        && (time() - $at) < AUTH_TTL_SECONDS;
}

// --- writing ------------------------------------------------------------------

/**
 * The runtime config the deployed site reads.
 *
 * Only non-secret values belong here — it is served to every visitor. The
 * secrets (site token, registry token) go to {@see secrets_path()}, which is
 * never web-readable.
 *
 * @param array<string,mixed> $profile
 * @param array<string,string> $c
 * @return array<string,mixed>
 */
function runtime_config(array $profile, array $c): array
{
    $proxy = ($c['mode'] ?? 'direct') === 'proxy';
    $api   = $proxy ? '/api' : trim_url($c['api_base']);
    $auth  = $proxy ? '/api/auth' : trim_url($c['auth_base']);

    $all = [
        'apiBase'          => $api,
        'authBase'         => $auth,
        'loginUrl'         => trim_url($c['login_url']),
        'contactUrl'       => $api . '/contact',
        'liveChatFrontend' => (string) $profile['id'],
    ];

    $out = [
        'version'     => 1,
        'site'        => (string) $profile['id'],
        'mode'        => $proxy ? 'proxy' : 'direct',
        'generatedAt' => gmdate('c'),
    ];
    /** @var list<string> $keys */
    $keys = $profile['runtime_keys'];
    foreach ($keys as $key) {
        $out[$key] = $all[$key] ?? '';
    }

    return $out;
}

/**
 * Where the secrets file goes.
 *
 * Preferred: one level ABOVE the docroot, where no request can reach it whatever
 * the vhost does. Plesk's `httpdocs` usually has a writable parent.
 *
 * When it does not, the file has to live inside the docroot — and then the
 * EXTENSION is the protection, not the `.htaccess`. Verified against a real web
 * server: a `.env` under the docroot is served as plain text on request, while a
 * `.php` file is executed and answers with zero bytes. So the fallback is a
 * `.php` whose first line is `<?php exit; ?>`; both readers skip that line
 * because it contains no `=`. The Apache deny is written too, but it is the
 * second line of defence rather than the only one — nginx-only hosts ignore it.
 */
function secrets_path(string $docroot, string $setupDir): string
{
    $parent = dirname($docroot);
    if ($parent !== $docroot && is_dir($parent) && is_writable($parent)) {
        return $parent . '/tds-site-secrets.env';
    }

    return $setupDir . '/tds-site-secrets.php';
}

/**
 * The task list for the apply phase.
 *
 * Order matters: everything that only READS runs first, so a broken connection
 * is reported before a single file is written.
 *
 * @param array<string,mixed> $profile
 * @param array<string,string> $c
 * @return list<array{0:string,1:string}>
 */
function install_tasks(array $profile, array $c): array
{
    $tasks = [
        ['check_gateway', 'API erreichbar'],
        ['check_public',  'Öffentliche Inhalte'],
        ['check_cors',    'CORS-Freigabe'],
        ['write_runtime', 'tds-runtime.json'],
        ['write_secrets', 'Geheimnisse ablegen'],
    ];
    if (($c['mode'] ?? 'direct') === 'proxy') {
        $tasks[] = ['write_proxy',  'Proxy /api einrichten'];
        $tasks[] = ['verify_proxy', 'Proxy prüfen'];
    }
    if (!empty($profile['registry_sync'])) {
        $tasks[] = ['sync_registry', 'Tool-Katalog übertragen'];
    }
    $tasks[] = ['finish', 'Abschluss'];

    return $tasks;
}

/**
 * Execute one task by id. Returns `[ok, detail]` — or `[null, detail]` for a
 * WARNING, which the UI paints amber and which does not fail the run.
 *
 * Small and idempotent, one per AJAX request, exactly like the gateway's
 * `run_task()`: no single multi-minute blocking request, and a live progress bar.
 *
 * @param array<string,mixed> $profile
 * @param array<string,string> $c
 * @return array{0:bool|null,1:string}
 */
function run_task(string $id, array $profile, array $c, string $docroot, string $setupDir, string $lockFile): array
{
    $apiBase = trim_url($c['api_base']);

    switch ($id) {
        case 'check_gateway':
            [$status, , $body, $err] = http_request($apiBase . '/healthz', ['timeout' => 12]);
            if ($status === 0) {
                return [false, 'Keine Verbindung zu ' . $apiBase . ' — ' . $err];
            }
            if ($status !== 200) {
                return [false, 'HTTP ' . $status . ' auf ' . $apiBase . '/healthz'];
            }
            $payload = json_body($body);
            $down = [];
            foreach (is_array($payload['services'] ?? null) ? $payload['services'] : [] as $name => $info) {
                $svcStatus = is_array($info) ? (int) ($info['status'] ?? 0) : 0;
                if ($svcStatus < 200 || $svcStatus >= 400) {
                    $down[] = (string) $name . ' (' . $svcStatus . ')';
                }
            }
            if ($down !== []) {
                // A service reported as status 0 is the signature of a malformed
                // .env killing it at boot — worth naming, it is invisible otherwise.
                return [null, 'Gateway antwortet, aber Dienste sind nicht gesund: ' . implode(', ', $down)];
            }

            return [true, 'Gateway antwortet (HTTP 200).'];

        case 'check_public':
            $details = [];
            $empty = [];
            $failed = [];
            /** @var list<array{0:string,1:string,2:string}> $routes */
            $routes = $profile['public_routes'];
            foreach ($routes as [$method, $path, $countKey]) {
                [$status, , $body] = http_request($apiBase . $path, ['method' => $method, 'timeout' => 15]);
                if ($status !== 200) {
                    $failed[] = $path . ' → HTTP ' . $status;
                    continue;
                }
                $n = count_items(json_body($body), $countKey);
                if ($n === null) {
                    $failed[] = $path . ' → unerwartete Antwort';
                    continue;
                }
                $details[] = $path . ': ' . $n;
                if ($n === 0) {
                    $empty[] = $path;
                }
            }
            if ($failed !== []) {
                return [false, implode("\n", $failed)];
            }
            if ($empty !== []) {
                return [null, 'Erreichbar, aber ohne Inhalte: ' . implode(', ', $empty)
                    . ' — die Site zeigt hier ihre statischen Platzhalter. (' . implode(' · ', $details) . ')'];
            }

            return [true, implode(' · ', $details)];

        case 'check_cors':
            $missing = [];
            /** @var list<string> $origins */
            $origins = $profile['origins'];
            foreach ($origins as $origin) {
                [$status, $headers] = http_request($apiBase . '/contact', [
                    'method'  => 'OPTIONS',
                    'headers' => [
                        'Origin'                         => $origin,
                        'Access-Control-Request-Method'  => 'POST',
                        'Access-Control-Request-Headers' => 'content-type',
                    ],
                    'timeout' => 12,
                ]);
                $allow = $headers['access-control-allow-origin'] ?? '';
                if ($status === 0 || ($allow !== $origin && $allow !== '*')) {
                    $missing[] = $origin;
                }
            }
            if ($missing === []) {
                return [true, 'Alle Origins freigegeben: ' . implode(', ', $origins)];
            }
            if (($c['mode'] ?? 'direct') === 'proxy') {
                // Same-origin calls never trigger a preflight, so this is FYI only.
                return [null, 'Nicht freigegeben: ' . implode(', ', $missing)
                    . ' — im Proxy-Modus unkritisch, da die Aufrufe same-origin laufen.'];
            }

            return [null, 'Nicht freigegeben: ' . implode(', ', $missing)
                . "\nIm Direkt-Modus scheitert damit der Preflight und die Aufrufe kommen nie an."
                . "\nCORS_ALLOWED_ORIGINS auf dem API-Host ergänzen um:\n" . implode(',', $missing)];

        case 'write_runtime':
            $file = $docroot . '/tds-runtime.json';
            $json = json_encode(
                runtime_config($profile, $c),
                JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            );
            $ok = @file_put_contents($file, $json . "\n") !== false;

            return [$ok, $ok ? 'tds-runtime.json geschrieben.' : 'Konnte tds-runtime.json nicht schreiben.'];

        case 'write_secrets':
            $file = secrets_path($docroot, $setupDir);
            $pairs = [
                'TDS_SITE'          => (string) $profile['id'],
                'TDS_SITE_TOKEN'    => $c['site_token'] ?? '',
                'TDS_REGISTRY_TOKEN'=> $c['registry_token'] ?? '',
            ];
            // The guard line makes the in-docroot fallback inert when requested:
            // PHP executes it and returns an empty body instead of the secrets.
            // Both readers skip it, because it contains no "=".
            $guard = str_ends_with($file, '.php') ? "<?php exit; ?>\n" : '';
            if (@file_put_contents($file, $guard . env_body($pairs)) === false) {
                return [false, 'Konnte ' . basename($file) . ' nicht schreiben.'];
            }
            @chmod($file, 0600);
            if (str_starts_with($file, $docroot . DIRECTORY_SEPARATOR)) {
                @file_put_contents($setupDir . '/.htaccess', "Require all denied\nDeny from all\n");

                return [null, 'Das Elternverzeichnis ist nicht beschreibbar, daher liegen die Geheimnisse '
                    . 'unter _setup/ — als .php-Datei (wird ausgeführt, gibt nichts aus) und zusätzlich per '
                    . '.htaccess gesperrt. Sicherer wäre ein beschreibbares Verzeichnis oberhalb des Docroots.'];
            }

            return [true, 'Abgelegt außerhalb des Docroots: ' . $file];

        case 'write_proxy':
            return write_proxy($profile, $c, $docroot, $setupDir);

        case 'verify_proxy':
            $base = public_base_url();
            // The probe MUST be a GET the allowlist permits — the public content
            // routes deliberately are not, because only the build fetches those.
            $probe = (string) ($profile['proxy_probe'] ?? '/tools/catalog');
            // Short timeout on purpose: PHP's built-in server is single-worker, so
            // a self-request from `php -S` DEADLOCKS until it expires. That is a
            // local-dev artefact, never a production failure — hence a warning.
            [$status, , $body, $err] = http_request($base . '/api' . $probe, ['timeout' => 6]);
            if ($status === 0) {
                return [null, 'Proxy konnte nicht selbst geprüft werden (' . $err . '). '
                    . 'Bei `php -S` ist das normal (Single-Worker). Bitte ' . $base . '/api' . $probe . ' manuell aufrufen.'];
            }
            if ($status !== 200) {
                return [false, 'Proxy antwortet mit HTTP ' . $status . ' auf ' . $base . '/api' . $probe];
            }
            if (json_body($body) === null) {
                return [false, 'Proxy antwortet, liefert aber kein JSON — vermutlich greift der Rewrite nicht '
                    . 'und der Webserver liefert die index.html der Site aus.'];
            }

            return [true, 'Proxy antwortet unter ' . $base . '/api'];

        case 'sync_registry':
            return sync_registry($apiBase, $c, $docroot);

        case 'finish':
            $ok = @file_put_contents($lockFile, env_body([
                'INSTALLED_AT' => gmdate('c'),
                'SITE'         => (string) $profile['id'],
                'MODE'         => $c['mode'] ?? 'direct',
                'API_BASE'     => $apiBase,
            ])) !== false;

            return [$ok, $ok
                ? 'Sperre gesetzt — der Assistent läuft ab jetzt nur noch im Diagnosemodus.'
                : 'Konnte die Sperre nicht schreiben (_setup/ nicht beschreibbar).'];
    }

    return [false, 'Unbekannter Schritt: ' . $id];
}

/**
 * Install the same-origin proxy.
 *
 * Three files, all under `<docroot>/api/`, so the site's own `.htaccess` is never
 * touched: `index.php` (the copied proxy), `config.php` (this site's baked
 * allowlist + upstream + secrets path) and `.htaccess` (the rewrite).
 *
 * @param array<string,mixed> $profile
 * @param array<string,string> $c
 * @return array{0:bool|null,1:string}
 */
function write_proxy(array $profile, array $c, string $docroot, string $setupDir): array
{
    $dir = $docroot . '/api';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        return [false, 'Konnte ' . $dir . ' nicht anlegen.'];
    }

    $source = $setupDir . '/proxy.php';
    if (!is_file($source)) {
        return [false, 'proxy.php fehlt in _setup/ — der Kopierschritt des Builds ist unvollständig.'];
    }
    if (!@copy($source, $dir . '/index.php')) {
        return [false, 'Konnte proxy.php nicht nach api/index.php kopieren.'];
    }

    $config = "<?php\n\n"
        . "// Generated by _setup/install.php on " . gmdate('c') . ". Do not edit by hand —\n"
        . "// re-run the setup wizard instead (delete _setup/.tds-site-installed first).\n\n"
        . "return " . var_export([
            'site'         => (string) $profile['id'],
            'upstream'     => trim_url($c['api_base']),
            'secrets_file' => secrets_path($docroot, $setupDir),
            'allow'        => $profile['proxy_allow'],
            'state_dir'    => dirname(secrets_path($docroot, $setupDir)),
        ], true) . ";\n";
    if (@file_put_contents($dir . '/config.php', $config) === false) {
        return [false, 'Konnte api/config.php nicht schreiben.'];
    }

    $htaccess = "RewriteEngine On\n"
        . "RewriteBase /api/\n"
        . "RewriteCond %{REQUEST_FILENAME} !-f\n"
        . "RewriteRule ^(.*)$ index.php [QSA,L]\n";
    if (@file_put_contents($dir . '/.htaccess', $htaccess) === false) {
        return [null, 'api/index.php + config.php geschrieben, aber api/.htaccess nicht — '
            . 'auf nginx-Hosts den Rewrite /api/* → /api/index.php bitte in der Server-Konfiguration setzen.'];
    }

    return [true, 'api/index.php, config.php und .htaccess geschrieben.'];
}

/**
 * Push the built tool catalog to `POST /tools/registry`.
 *
 * This exists because the tools site's own build never does it: `_build.yml`
 * exports no `TOOLS_REGISTRY_TOKEN`, so `src/lib/catalog.ts` skips the sync
 * silently and the admin panel has never seen the tool list. Doing it host-side
 * also keeps the token off the CI runner.
 *
 * @param array<string,string> $c
 * @return array{0:bool|null,1:string}
 */
function sync_registry(string $apiBase, array $c, string $docroot): array
{
    $tokenValue = $c['registry_token'] ?? '';
    if ($tokenValue === '') {
        return [null, 'Kein Registry-Token angegeben — übersprungen. Der Katalog bleibt im Panel leer.'];
    }

    $file = $docroot . '/tools-catalog.json';
    if (!is_file($file)) {
        return [null, 'tools-catalog.json nicht im Docroot gefunden — der Build hat den Katalog nicht abgelegt.'];
    }
    $catalog = json_body((string) @file_get_contents($file));
    /** @var mixed $tools */
    $tools = is_array($catalog) ? ($catalog['tools'] ?? $catalog) : null;
    if (!is_array($tools) || $tools === []) {
        return [null, 'tools-catalog.json enthält keine Tools — übersprungen.'];
    }

    [$status, , $body, $err] = http_request($apiBase . '/tools/registry', [
        'method'  => 'POST',
        'headers' => ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
        'body'    => json_encode(['token' => $tokenValue, 'tools' => array_values($tools)]),
        'timeout' => 20,
    ]);
    if ($status === 0) {
        return [false, 'Registry nicht erreichbar: ' . $err];
    }
    if ($status === 401) {
        return [false, 'Registry-Token abgelehnt (401). Er muss dem Wert unter Einstellungen → Tools entsprechen.'];
    }
    if ($status === 503) {
        return [null, 'Die Registry ist auf der API noch nicht konfiguriert (503). '
            . 'Token zuerst im Panel unter Einstellungen → Tools setzen.'];
    }
    if ($status !== 200) {
        return [false, 'Registry antwortet mit HTTP ' . $status];
    }
    $payload = json_body($body);
    $count = is_array($payload) ? (int) ($payload['count'] ?? count($tools)) : count($tools);

    return [true, $count . ' Tools übertragen.'];
}

/** The site's own public base URL, as the browser reached it. */
function public_base_url(): string
{
    $https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
    $proto = $https ? 'https' : 'http';
    if (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') !== '') {
        $proto = explode(',', (string) $_SERVER['HTTP_X_FORWARDED_PROTO'])[0];
    }
    $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');

    return $proto . '://' . trim($host);
}

// --- state --------------------------------------------------------------------

$profile = load_profile($SETUP_DIR);
$profileOk = $profile !== null;
$locked = is_file($LOCK_FILE);
$lockInfo = $locked ? read_env_kv($LOCK_FILE) : [];
$runtimeFile = $DOCROOT . '/tds-runtime.json';

$steps = [
    1 => 'Voraussetzungen',
    2 => 'Anmeldung',
    3 => 'Konfiguration',
    4 => 'Verbinden',
    5 => 'Fertig',
];

$step = (int) ($_POST['__step'] ?? $_GET['step'] ?? 1);
$errors = [];

// --- AJAX: run one task, always answer JSON ----------------------------------
// Gate on the LOCK FILE only, never on a derived "already configured" flag: the
// first task writes tds-runtime.json, which such a flag would pick up — aborting
// every following task. That exact bug is documented in the gateway's installer.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['__task'])) {
    header('Content-Type: application/json; charset=utf-8');
    ini_set('display_errors', '0');
    ini_set('html_errors', '0');
    error_reporting(E_ALL);
    @set_time_limit(0);
    ignore_user_abort(true);

    $responded = false;
    $respond = static function (?bool $ok, string $detail) use (&$responded): void {
        if ($responded) {
            return;
        }
        $responded = true;
        echo json_encode(
            ['ok' => $ok === true, 'warn' => $ok === null, 'detail' => $detail],
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        );
    };
    // A fatal would otherwise send HTML, and the browser's r.json() would choke
    // with "Unexpected token '<'" — the failure would point nowhere near its cause.
    register_shutdown_function(static function () use ($respond): void {
        $e = error_get_last();
        if ($e !== null && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR], true)) {
            $respond(false, 'PHP-Fatal: ' . $e['message'] . ' @ ' . basename((string) $e['file']) . ':' . $e['line']);
        }
    });
    $fail = static function (string $msg) use ($respond): never {
        $respond(false, $msg);
        exit;
    };

    if (!$profileOk) {
        $fail('Kein Site-Profil gefunden (_setup/profile.php).');
    }
    if ($locked) {
        $fail('Bereits eingerichtet (_setup/.tds-site-installed vorhanden).');
    }
    if (!is_authed()) {
        $fail('Sitzung abgelaufen — bitte erneut anmelden.');
    }
    $c = $_SESSION[SESSION_KEY] ?? null;
    if (!is_array($c) || ($c['api_base'] ?? '') === '') {
        $fail('Sitzung abgelaufen — bitte den Assistenten von vorne starten.');
    }

    try {
        /** @var array<string,mixed> $profile */
        [$ok, $detail] = run_task((string) $_POST['__task'], $profile, $c, $DOCROOT, $SETUP_DIR, $LOCK_FILE);
        $respond($ok, (string) $detail);
    } catch (\Throwable $e) {
        $respond(false, 'Ausnahme: ' . $e->getMessage());
    }
    exit;
}

// --- form handling ------------------------------------------------------------

if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$locked && $profileOk) {
    if ($step === 2) {
        $authBase = trim_url(post('auth_base', 'https://api.tracht-digital.de/auth'));
        set_cfg(['auth_base' => $authBase]);

        $attempts = recent_attempts($ATTEMPTS);
        if (count($attempts) >= LOGIN_MAX_ATTEMPTS) {
            $wait = (int) ceil((LOGIN_WINDOW_SECONDS - (time() - min($attempts))) / 60);
            $errors[] = 'Zu viele Fehlversuche. Bitte in etwa ' . max(1, $wait) . ' Minuten erneut versuchen.';
            $step = 2;
        } else {
            [$ok, $detail] = verify_admin($authBase, post('email'), post('password'));
            if ($ok) {
                clear_attempts($ATTEMPTS);
                set_cfg(['authed' => '1', 'authed_at' => (string) time(), 'admin_email' => $detail]);
                $_SESSION[SESSION_KEY]['authed'] = true;
                $_SESSION[SESSION_KEY]['authed_at'] = time();
                $step = 3;
            } else {
                record_attempt($ATTEMPTS);
                $errors[] = $detail;
                $step = 2;
            }
        }
    } elseif ($step === 3 && is_authed()) {
        $mode = post('mode', 'direct') === 'proxy' ? 'proxy' : 'direct';
        set_cfg([
            'api_base'       => trim_url(post('api_base', 'https://api.tracht-digital.de')),
            'auth_base'      => trim_url(post('auth_base', 'https://api.tracht-digital.de/auth')),
            'login_url'      => trim_url(post('login_url', 'https://auth.tracht-digital.de')),
            'mode'           => $mode,
            'site_token'     => post('site_token') ?: token(32),
            'registry_token' => post('registry_token'),
        ]);
        $step = 4;
    } elseif ($step === 3) {
        $errors[] = 'Sitzung abgelaufen — bitte erneut anmelden.';
        $step = 2;
    }
}

// Steps 3+ are admin-only. Anyone landing there without a session goes back to 2.
if ($step >= 3 && $step <= 4 && !is_authed()) {
    $step = 2;
}

$hardFail = false;
$rewriteOk = false;
$parentWritable = is_dir(dirname($DOCROOT)) && is_writable(dirname($DOCROOT));

?>
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>TDS — Frontend verbinden</title>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  /* Flat, matching the gateway installer and the panels: solid surfaces,
     hairlines + accent bars, one navy accent, no gradients or lifted shadows. */
  :root{--haupt:#050f68;--akzent:#820933;--paper:#fafaf7;--soft:#f1efe8;--line:#e4e2da;
    --ink:#1a1a17;--muted:#6b6b66;--card:#fff;
    --ok:#146c43;--okbg:#e6f4ea;--err:#a51d1d;--errbg:#fbeaea;--warn:#8a5a00;--warnbg:#fff4d6;
    --tint:color-mix(in srgb,var(--haupt) 7%,var(--paper));
    --fd:"Lato",system-ui,sans-serif;--fb:"Plus Jakarta Sans",system-ui,sans-serif;
    --fm:"JetBrains Mono",ui-monospace,monospace;}
  *{box-sizing:border-box}
  body{margin:0;font-family:var(--fb);background:var(--paper);color:var(--ink);line-height:1.55;min-height:100vh}

  .wrap{max-width:760px;margin:0 auto;padding:clamp(28px,6vw,56px) 20px 80px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:clamp(24px,4vw,40px)}

  .brandmark{display:inline-flex;align-items:center;gap:10px;margin-bottom:14px}
  .brandmark .mk{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;color:#fff;
    font-family:var(--fd);font-weight:900;font-size:16px;background:var(--haupt)}
  .brandmark .wd{font-family:var(--fd);font-weight:700;font-size:18px;letter-spacing:-.01em}
  .brandmark .wd i{font-style:italic;color:var(--akzent)}

  h1{font-family:var(--fd);font-weight:900;letter-spacing:-.03em;font-size:clamp(28px,5vw,38px);
    margin:0 0 12px;position:relative;display:inline-block}
  h1::after{content:"";position:absolute;left:0;bottom:-6px;height:3px;width:52px;background:var(--haupt)}
  .eyebrow{font-family:var(--fd);font-weight:700;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--akzent);margin:0 0 8px}
  h2{font-family:var(--fd);font-weight:700;letter-spacing:-.02em;font-size:21px;margin:30px 0 6px}
  p{margin:0 0 14px;color:var(--muted)}
  code{font-family:var(--fm);font-size:.85em;background:var(--soft);padding:.1em .4em;border-radius:4px}

  .steps{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0 30px;font-size:13px}
  .steps span{display:inline-flex;align-items:center;padding:6px 12px;border-radius:8px;border:1px solid var(--line);
    color:var(--muted);background:var(--paper)}
  .steps span.on{background:var(--haupt);color:#fff;border-color:var(--haupt);font-weight:600}
  .steps span.done{border-color:color-mix(in srgb,var(--ok) 45%,var(--line));color:var(--ok);background:var(--okbg)}

  label{display:block;font-weight:600;font-size:14px;margin:14px 0 5px}
  label .opt{font-weight:400;color:var(--muted);font-size:12px}
  input[type=text],input[type=email],input[type=password]{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:8px;
    font-family:var(--fm);font-size:14px;background:#fff;color:var(--ink);transition:border-color .15s ease,box-shadow .15s ease}
  input:focus{outline:none;border-color:var(--haupt);box-shadow:0 0 0 2px color-mix(in srgb,var(--haupt) 18%,transparent)}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media (max-width:40rem){.row{grid-template-columns:1fr}}
  fieldset{border:1px solid var(--line);border-radius:12px;padding:18px;margin:20px 0;background:var(--tint)}
  legend{font-family:var(--fd);font-weight:700;padding:0 8px;font-size:14px}

  .btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--haupt);border-radius:10px;color:#fff;
    background:var(--haupt);font-family:var(--fd);font-weight:700;font-size:15px;padding:11px 22px;cursor:pointer;
    text-decoration:none;margin-top:20px;min-height:44px;transition:background .15s ease}
  .btn:hover{background:color-mix(in srgb,var(--haupt) 88%,#000)}
  .btn:disabled{opacity:.55;cursor:default}
  .btn.ghost{background:transparent;color:var(--haupt);border-color:var(--line)}
  .btn.ghost:hover{background:var(--tint)}

  .check{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px}
  .badge{font-family:var(--fm);font-size:11px;font-weight:600;padding:3px 9px;border-radius:6px;white-space:nowrap}
  .b-ok{background:var(--okbg);color:var(--ok)} .b-err{background:var(--errbg);color:var(--err)} .b-warn{background:var(--warnbg);color:var(--warn)}
  .note{padding:12px 15px;border-radius:10px;font-size:14px;margin:14px 0;border-left:3px solid transparent}
  .note.err{background:var(--errbg);color:var(--err);border-left-color:var(--err)}
  .note.ok{background:var(--okbg);color:var(--ok);border-left-color:var(--ok)}
  .note.warn{background:var(--warnbg);color:var(--warn);border-left-color:var(--warn)}
  pre{background:var(--ink);color:#f5f3ec;padding:12px 14px;border-radius:8px;overflow:auto;font-family:var(--fm);font-size:12px;max-height:240px;white-space:pre-wrap}
  .cb{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:14px;color:var(--ink);font-weight:400}
  .muted-line{font-size:13px;color:var(--muted);margin-top:6px}

  #progress{margin-top:24px}
  .bar{height:10px;border-radius:6px;overflow:hidden;background:var(--soft);border:1px solid var(--line)}
  .bar>i{display:block;height:100%;width:0;background:var(--haupt);transition:width .35s ease}
  #progressLabel{font-family:var(--fd);font-weight:700;color:var(--ink);margin:12px 0 4px}
  #log{margin-top:6px}
  @media (prefers-reduced-motion:reduce){.bar>i,input{transition:none}}
</style>
</head>
<body>
<main class="wrap">
<div class="card">
  <div class="brandmark"><span class="mk">T</span><span class="wd">Tracht <i>Digital</i></span></div>
  <p class="eyebrow"><?= $profileOk ? h((string) $profile['name']) : 'Frontend' ?> · Setup</p>
  <h1>Mit der API verbinden</h1>
  <p>Assistent zum Verbinden dieses Frontends mit der TDS-API — prüfen, konfigurieren, absichern.</p>

  <div class="steps">
    <?php foreach ($steps as $n => $label): ?>
      <span class="<?= $n === $step ? 'on' : ($n < $step ? 'done' : '') ?>"><?= $n ?>. <?= h($label) ?></span>
    <?php endforeach; ?>
  </div>

  <?php foreach ($errors as $e): ?>
    <div class="note err"><?= h($e) ?></div>
  <?php endforeach; ?>

  <?php if (!$profileOk): ?>
    <div class="note err">
      <strong>Kein Site-Profil gefunden.</strong> Es fehlt <code>_setup/profile.php</code>.
      Diese Datei legt der Build-Schritt <code>scripts/sync-installer.mjs</code> an —
      der Assistent wurde also von Hand kopiert oder der <code>prebuild</code>-Schritt fehlt.
    </div>

  <?php elseif ($locked): ?>
    <h2>Bereits eingerichtet</h2>
    <div class="note warn">
      Dieses Frontend wurde am <code><?= h($lockInfo['INSTALLED_AT'] ?? '?') ?></code> verbunden
      (Modus <code><?= h($lockInfo['MODE'] ?? '?') ?></code>, API <code><?= h($lockInfo['API_BASE'] ?? '?') ?></code>).
      Der Assistent läuft aus Sicherheitsgründen nur noch im Diagnosemodus.
      Zum Neu-Verbinden bitte <code>_setup/.tds-site-installed</code> löschen.
    </div>
    <h2>Aktueller Stand</h2>
    <?php
      $runtimeOk = is_file($runtimeFile);
      $runtime = $runtimeOk ? json_decode((string) @file_get_contents($runtimeFile), true) : null;
      $proxyOk = is_file($DOCROOT . '/api/index.php') && is_file($DOCROOT . '/api/config.php');
    ?>
    <div class="check">
      <span class="badge <?= $runtimeOk ? 'b-ok' : 'b-err' ?>"><?= $runtimeOk ? 'OK' : 'Fehlt' ?></span>
      <span>tds-runtime.json<?php if (is_array($runtime)): ?> — Modus <code><?= h((string) ($runtime['mode'] ?? '?')) ?></code>, API <code><?= h((string) ($runtime['apiBase'] ?? '?')) ?></code><?php endif; ?></span>
    </div>
    <div class="check">
      <span class="badge <?= $proxyOk ? 'b-ok' : 'b-warn' ?>"><?= $proxyOk ? 'OK' : 'Aus' ?></span>
      <span>Same-Origin-Proxy unter <code>/api</code></span>
    </div>
    <?php if (is_array($runtime)): ?>
      <pre><?= h((string) json_encode($runtime, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) ?></pre>
    <?php endif; ?>

  <?php elseif ($step === 1): ?>
    <?php
      $checks = [];
      $phpOk = version_compare(PHP_VERSION, '8.1.0', '>=');
      $checks[] = ['PHP ' . PHP_VERSION, $phpOk, 'mind. PHP 8.1'];
      $httpOk = function_exists('curl_init') || (bool) ini_get('allow_url_fopen');
      $checks[] = ['Ausgehende HTTP-Aufrufe', $httpOk, function_exists('curl_init') ? 'cURL' : 'allow_url_fopen'];
      foreach (['json', 'mbstring'] as $ext) {
          $checks[] = ['Erweiterung ' . $ext, extension_loaded($ext), ''];
      }
      $docrootWritable = is_writable($DOCROOT);
      $checks[] = ['Docroot beschreibbar', $docrootWritable, 'für tds-runtime.json'];
      $setupWritable = is_writable($SETUP_DIR);
      $checks[] = ['_setup/ beschreibbar', $setupWritable, 'für die Sperre'];
      $checks[] = ['Elternverzeichnis beschreibbar', $parentWritable,
          $parentWritable ? 'Geheimnisse liegen außerhalb des Docroots' : 'Geheimnisse landen in _setup/ (mit .htaccess gesperrt)'];
      $distOk = is_file($DOCROOT . '/index.html');
      $checks[] = ['Gebaute Site vorhanden', $distOk, 'index.html im Docroot'];
      $rewriteOk = function_exists('apache_get_modules')
          ? in_array('mod_rewrite', apache_get_modules(), true)
          : is_file($DOCROOT . '/.htaccess');
      $proxySource = is_file($SETUP_DIR . '/proxy.php');
      $checks[] = ['proxy.php mitgeliefert', $proxySource, 'für den Same-Origin-Modus'];

      $buildInfo = [];
      if (is_file($DOCROOT . '/.build-info')) {
          $buildInfo = read_env_kv($DOCROOT . '/.build-info');
      }
      $hardFail = !$phpOk || !$httpOk || !$docrootWritable || !$setupWritable || !$distOk;
      set_cfg(['rewrite_ok' => $rewriteOk ? '1' : '', 'proxy_source' => $proxySource ? '1' : '']);
    ?>
    <h2>Voraussetzungen</h2>
    <?php foreach ($checks as [$label, $ok, $hint]): ?>
      <div class="check">
        <span class="badge <?= $ok ? 'b-ok' : 'b-err' ?>"><?= $ok ? 'OK' : 'Fehlt' ?></span>
        <span><?= h($label) ?><?php if ($hint): ?> <span style="color:var(--muted)">— <?= h($hint) ?></span><?php endif; ?></span>
      </div>
    <?php endforeach; ?>

    <?php if ($buildInfo !== []): ?>
      <h2>Ausgelieferter Stand</h2>
      <p class="muted-line">
        Kanal <code><?= h($buildInfo['channel'] ?? '?') ?></code> ·
        Commit <code><?= h(substr($buildInfo['commit'] ?? '?', 0, 8)) ?></code> ·
        gebaut <code><?= h($buildInfo['built_at'] ?? '?') ?></code>
      </p>
      <?php if (($buildInfo['channel'] ?? '') === 'dev'): ?>
        <div class="note warn">Dies ist ein <code>dev</code>-Build (Demo-Modus). Für die Produktion muss der <code>release</code>-Branch ausgeliefert sein.</div>
      <?php endif; ?>
    <?php endif; ?>

    <?php if ($hardFail): ?>
      <div class="note err">Bitte zuerst die rot markierten Punkte beheben.</div>
    <?php else: ?>
      <form method="get"><input type="hidden" name="step" value="2" /><button class="btn" type="submit">Weiter zur Anmeldung →</button></form>
    <?php endif; ?>

  <?php elseif ($step === 2): ?>
    <h2>Anmeldung</h2>
    <p>
      Dieser Assistent liegt auf einer öffentlich erreichbaren Domain und kommt mit jedem Deploy zurück.
      Er verlangt deshalb eine Anmeldung als <strong>Plattform-Administrator</strong> — dieselben Zugangsdaten wie
      unter <code>auth.tracht-digital.de</code>. Die Daten werden nur zur Prüfung verwendet und nirgends gespeichert.
    </p>
    <form method="post" autocomplete="off">
      <input type="hidden" name="__step" value="2" />
      <label>Auth-API-URL</label>
      <input type="text" name="auth_base" value="<?= h(cfg('auth_base', 'https://api.tracht-digital.de/auth')) ?>" />
      <div class="row">
        <div><label>E-Mail</label><input type="email" name="email" autocomplete="username" /></div>
        <div><label>Passwort</label><input type="password" name="password" autocomplete="current-password" /></div>
      </div>
      <button class="btn" type="submit">Anmelden →</button>
    </form>

  <?php elseif ($step === 3): ?>
    <?php
      $canProxy = cfg('proxy_source') === '1';
      $defaultMode = ($canProxy && cfg('rewrite_ok') === '1') ? 'proxy' : 'direct';
      $mode = cfg('mode', $defaultMode);
    ?>
    <h2>Konfiguration</h2>
    <p>Angemeldet als <code><?= h(cfg('admin_email')) ?></code>. Diese Werte landen in <code>tds-runtime.json</code>, die die Site zur Laufzeit liest — ein Rebuild ist dafür nicht nötig.</p>
    <form method="post">
      <input type="hidden" name="__step" value="3" />
      <fieldset>
        <legend>Endpunkte</legend>
        <label>API-Basis-URL <span class="opt">(das Gateway)</span></label>
        <input type="text" name="api_base" value="<?= h(cfg('api_base', 'https://api.tracht-digital.de')) ?>" />
        <div class="row">
          <div><label>Auth-API-URL</label><input type="text" name="auth_base" value="<?= h(cfg('auth_base', 'https://api.tracht-digital.de/auth')) ?>" /></div>
          <div><label>Login-Seite <span class="opt">(für gesperrte Inhalte)</span></label><input type="text" name="login_url" value="<?= h(cfg('login_url', 'https://auth.tracht-digital.de')) ?>" /></div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Verbindungsmodus</legend>
        <label class="cb">
          <input type="radio" name="mode" value="proxy" <?= $mode === 'proxy' ? 'checked' : '' ?> <?= $canProxy ? '' : 'disabled' ?> />
          <span>
            <strong>Same-Origin-Proxy</strong> — die Site ruft <code>/api/…</code> auf dem eigenen Host auf,
            ein schlankes PHP-Skript reicht nur die freigegebenen Routen an die API weiter.
            Kein CORS, und das Site-Token verlässt den Server nie.
            <?php if (!$canProxy): ?><br /><span style="color:var(--err)">Nicht verfügbar: <code>proxy.php</code> fehlt in <code>_setup/</code>.</span><?php endif; ?>
          </span>
        </label>
        <label class="cb">
          <input type="radio" name="mode" value="direct" <?= $mode === 'direct' ? 'checked' : '' ?> />
          <span><strong>Direkt</strong> — der Browser ruft die API-Domain direkt auf. Setzt voraus, dass die Origins dieser Site in <code>CORS_ALLOWED_ORIGINS</code> stehen; der nächste Schritt prüft das.</span>
        </label>
        <label>Site-Token <span class="opt">(leer = automatisch; nur im Proxy-Modus verwendet)</span></label>
        <input type="text" name="site_token" value="<?= h(cfg('site_token', token(32))) ?>" />
      </fieldset>

      <?php if (!empty($profile['registry_sync'])): ?>
        <fieldset>
          <legend>Tool-Katalog</legend>
          <p class="muted-line">
            Überträgt die gebauten Tools an <code>POST /tools/registry</code>, damit sie im Admin-Panel
            auftauchen. Der Token muss dem Wert unter <em>Einstellungen → Tools</em> entsprechen.
            Leer lassen überspringt den Schritt.
          </p>
          <label>Registry-Sync-Token</label>
          <input type="text" name="registry_token" value="<?= h(cfg('registry_token')) ?>" />
        </fieldset>
      <?php endif; ?>

      <button class="btn" type="submit">Weiter zur Übersicht →</button>
    </form>

  <?php elseif ($step === 4): ?>
    <?php
      /** @var array<string,mixed> $profile */
      $c = $_SESSION[SESSION_KEY] ?? [];
      $tasks = install_tasks($profile, $c);
      $preview = runtime_config($profile, $c);
    ?>
    <h2>Übersicht &amp; Verbinden</h2>
    <p>Zuerst wird nur gelesen und geprüft; erst danach wird geschrieben. Ein Fehler in den Prüfschritten bricht den Lauf nicht ab — er wird gemeldet, damit du siehst, was auf dem API-Host noch fehlt.</p>

    <div id="review">
      <div class="check"><span class="badge b-ok">Site</span><span><?= h((string) $profile['name']) ?> (<code><?= h((string) $profile['id']) ?></code>)</span></div>
      <div class="check"><span class="badge b-ok">API</span><span><code><?= h(cfg('api_base')) ?></code></span></div>
      <div class="check"><span class="badge b-ok">Modus</span><span><?= cfg('mode') === 'proxy' ? 'Same-Origin-Proxy unter <code>/api</code>' : 'Direkt (CORS)' ?></span></div>
      <div class="check"><span class="badge b-ok">Origins</span><span><?= h(implode(', ', $profile['origins'])) ?></span></div>
    </div>

    <h2>tds-runtime.json</h2>
    <pre><?= h((string) json_encode($preview, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) ?></pre>

    <button class="btn" type="button" id="startBtn" data-tasks='<?= h((string) json_encode($tasks, JSON_UNESCAPED_UNICODE)) ?>'>Jetzt verbinden →</button>

    <div id="progress" hidden>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="barFill"></i></div>
      <p class="muted-line" id="progressLabel">Verbindung wird eingerichtet …</p>
      <div id="log"></div>
    </div>

    <div id="donePanel" hidden>
      <h2 id="doneHeading">Verbunden</h2>
      <div class="note ok">
        Die Site liest ihre API-Ziele ab sofort aus <code>tds-runtime.json</code>.
        Ein Rebuild ist nicht nötig — ein erneuter Deploy überschreibt die Datei nicht,
        weil sie nicht Teil von <code>dist/</code> ist.
      </div>
      <div class="note warn">
        <strong>Build-Zeit bleibt getrennt:</strong> Inhalte, die beim <code>astro build</code> geholt werden
        (Blogbeiträge, CMS-Blöcke, Rechtstexte), kommen weiterhin aus den Umgebungsvariablen der GitHub Action.
        Wird die API-Adresse dort anders gesetzt, laufen Laufzeit und Build auseinander.
      </div>
      <p class="muted-line">Die Sperre <code>_setup/.tds-site-installed</code> ist gesetzt; ein erneuter Aufruf zeigt nur noch den Status.</p>
    </div>

    <noscript>
      <div class="note warn">
        JavaScript ist deaktiviert. Der Assistent führt die Schritte einzeln über den Browser aus und
        benötigt es deshalb — bitte JavaScript für diese Seite aktivieren.
      </div>
    </noscript>

    <script>
    (function () {
      var btn = document.getElementById('startBtn');
      if (!btn) return;
      var tasks = JSON.parse(btn.getAttribute('data-tasks'));
      var progress = document.getElementById('progress');
      var fill = document.getElementById('barFill');
      var bar = progress.querySelector('.bar');
      var label = document.getElementById('progressLabel');
      var log = document.getElementById('log');
      var review = document.getElementById('review');

      function row(taskLabel) {
        var d = document.createElement('div');
        d.className = 'check';
        var b = document.createElement('span');
        b.className = 'badge b-warn';
        b.textContent = '…';
        var t = document.createElement('span');
        t.textContent = taskLabel;
        d.appendChild(b); d.appendChild(t);
        log.appendChild(d);
        return { node: d, badge: b, text: t };
      }
      function setProgress(done, total) {
        var pct = Math.round((done / total) * 100);
        fill.style.width = pct + '%';
        bar.setAttribute('aria-valuenow', String(pct));
      }
      function runTask(id) {
        var body = new URLSearchParams();
        body.set('__task', id);
        return fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'fetch' },
          body: body.toString(),
          credentials: 'same-origin'
        }).then(function (r) { return r.json(); })
          .catch(function (e) { return { ok: false, warn: false, detail: 'Netzwerkfehler: ' + e }; });
      }

      btn.addEventListener('click', function () {
        btn.disabled = true;
        if (review) review.hidden = true;
        progress.hidden = false;
        var total = tasks.length, i = 0, anyFail = false, anyWarn = false;

        function next() {
          if (i >= total) {
            label.textContent = anyFail
              ? 'Abgeschlossen — einige Schritte sind fehlgeschlagen (siehe oben).'
              : (anyWarn ? 'Abgeschlossen — mit Hinweisen (siehe oben).' : 'Alle Schritte erfolgreich abgeschlossen.');
            var heading = document.getElementById('doneHeading');
            if (anyFail) heading.textContent = 'Mit Fehlern abgeschlossen';
            else if (anyWarn) heading.textContent = 'Verbunden — mit Hinweisen';
            var spans = document.querySelectorAll('.steps span');
            if (spans[3]) { spans[3].className = 'done'; }
            if (spans[4]) { spans[4].className = 'on'; }
            document.getElementById('donePanel').hidden = false;
            return;
          }
          var task = tasks[i];
          label.textContent = 'Schritt ' + (i + 1) + ' von ' + total + ': ' + task[1];
          var r = row(task[1]);
          runTask(task[0]).then(function (res) {
            var kind = res.ok ? 'b-ok' : (res.warn ? 'b-warn' : 'b-err');
            r.badge.className = 'badge ' + kind;
            r.badge.textContent = res.ok ? 'OK' : (res.warn ? 'Hinweis' : 'Fehler');
            if (res.warn) anyWarn = true;
            if (!res.ok && !res.warn) anyFail = true;
            if (res.detail) {
              // A one-line OK reads better inline; anything else gets a block so
              // multi-line remediation text (the CORS list) stays readable.
              if (res.ok && res.detail.indexOf('\n') === -1) {
                var hint = document.createElement('span');
                hint.style.color = 'var(--muted)';
                hint.textContent = ' — ' + res.detail;
                r.text.appendChild(hint);
              } else {
                var pre = document.createElement('pre');
                pre.textContent = res.detail;
                r.node.insertAdjacentElement('afterend', pre);
              }
            }
            i++;
            setProgress(i, total);
            next();
          });
        }
        next();
      });
    })();
    </script>
  <?php endif; ?>
</div>
</main>
</body>
</html>
