<?php

declare(strict_types=1);

/**
 * TDS — Same-Origin-API-Proxy für die öffentlichen Frontends
 * ==========================================================
 *
 * Copied to `<docroot>/api/index.php` by `_setup/install.php` when the operator
 * picks the proxy connection mode. Its companion `<docroot>/api/config.php` is
 * generated at the same time and carries this site's upstream, allowlist and
 * secrets path — so this file needs no knowledge of which site it runs on.
 *
 * ### Why a proxy at all
 *
 * The three public sites are static and live on their own hosts, so every API
 * call from the browser is cross-origin. That has three costs this removes:
 *
 *   - It depends on `CORS_ALLOWED_ORIGINS` being right on the API host. When it
 *     is not, the PREFLIGHT fails — so the request is never sent, the button
 *     just looks dead, and the network tab shows an OPTIONS where you are
 *     looking for a POST.
 *   - Anything the site wants to prove about itself would have to travel through
 *     the browser, where it is not a secret. Here the site token is added
 *     server-side and never reaches the client.
 *   - Same-origin calls skip the preflight round-trip entirely.
 *
 * ### The allowlist is the security boundary
 *
 * Matching is `[method, pattern]` pairs from the profile — never a prefix match.
 * A proxy that forwarded `/admin/*` would be an open door into the management
 * API, reachable from the public marketing site, with the host's own IP as the
 * caller. Anything unmatched is a flat 404.
 *
 * @see install.php  the wizard that writes this file and its config
 */

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo '{"error":"Proxy not configured"}';
    exit;
}

/** @var array{site:string,upstream:string,secrets_file:string,allow:list<array{0:string,1:string}>,state_dir:string} $config */
$config = require $configFile;

/** Requests per client IP per minute. The proxy must not become an open relay. */
const RATE_MAX = 30;

// --- request -----------------------------------------------------------------

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

// Strip the mount point. The rewrite keeps the original REQUEST_URI, so the
// path still starts with /api — with or without a trailing segment.
if (str_starts_with($path, '/api')) {
    $path = substr($path, 4);
}
if ($path === '' || $path[0] !== '/') {
    $path = '/' . $path;
}
$query = (string) ($_SERVER['QUERY_STRING'] ?? '');

/**
 * Answer with JSON and stop. Used for every refusal, so a blocked call is
 * distinguishable from an upstream error by its shape as well as its status.
 */
$deny = static function (int $status, string $error): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $error], JSON_UNESCAPED_SLASHES);
    exit;
};

// A preflight can only reach this file same-origin, where the browser does not
// send one. If it does happen (a stray absolute URL somewhere), answering 204
// without CORS headers is correct: the call belongs on the direct route.
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// --- allowlist ---------------------------------------------------------------

$allowed = false;
foreach ($config['allow'] as [$allowMethod, $pattern]) {
    if (strtoupper((string) $allowMethod) !== $method) {
        continue;
    }
    if (preg_match((string) $pattern, $path) === 1) {
        $allowed = true;
        break;
    }
}
if (!$allowed) {
    $deny(404, 'Not found');
}

// --- rate limit --------------------------------------------------------------

$clientIp = client_ip();
$stateDir = (string) $config['state_dir'];
if (is_dir($stateDir) && is_writable($stateDir)) {
    $minute = (int) floor(time() / 60);
    // The IP is hashed, never stored raw — same rule the API's own contact and
    // live-chat limiters follow.
    $bucket = $stateDir . '/tds-proxy-rl-' . substr(hash('sha256', $clientIp . '|' . $config['site']), 0, 24);
    $count = 0;
    $raw = is_file($bucket) ? (string) @file_get_contents($bucket) : '';
    if ($raw !== '' && str_contains($raw, ':')) {
        [$storedMinute, $storedCount] = explode(':', $raw, 2);
        if ((int) $storedMinute === $minute) {
            $count = (int) $storedCount;
        }
    }
    if ($count >= RATE_MAX) {
        header('Retry-After: 60');
        $deny(429, 'Too many requests');
    }
    @file_put_contents($bucket, $minute . ':' . ($count + 1), LOCK_EX);

    // Opportunistic sweep — no cron on this host, and a bucket file per client
    // would otherwise accumulate forever.
    if (random_int(1, 200) === 1) {
        foreach (glob($stateDir . '/tds-proxy-rl-*') ?: [] as $stale) {
            if (@filemtime($stale) < time() - 3600) {
                @unlink($stale);
            }
        }
    }
}

// --- secrets -----------------------------------------------------------------

$secrets = read_secrets((string) $config['secrets_file']);

// --- forward -----------------------------------------------------------------

$url = rtrim((string) $config['upstream'], '/') . $path . ($query !== '' ? '?' . $query : '');

$forward = [
    'Accept'          => (string) ($_SERVER['HTTP_ACCEPT'] ?? 'application/json'),
    'X-Tds-Site'      => (string) $config['site'],
    // Forward the real client IP: the API's contact and live-chat limiters hash
    // the FIRST hop of X-Forwarded-For. Without this every visitor would arrive
    // as this host's single IP and they would lock each other out after five
    // messages.
    'X-Forwarded-For' => $clientIp,
];
if (($_SERVER['HTTP_CONTENT_TYPE'] ?? '') !== '' || ($_SERVER['CONTENT_TYPE'] ?? '') !== '') {
    $forward['Content-Type'] = (string) ($_SERVER['HTTP_CONTENT_TYPE'] ?? $_SERVER['CONTENT_TYPE']);
}
if (($_SERVER['HTTP_COOKIE'] ?? '') !== '') {
    // The shared session cookie is Domain=.tracht-digital.de, so a same-origin
    // call to this subdomain already carries it; the login gate on the tools
    // site depends on it reaching /auth/me.
    $forward['Cookie'] = (string) $_SERVER['HTTP_COOKIE'];
}
if (($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '') !== '') {
    $forward['Accept-Language'] = (string) $_SERVER['HTTP_ACCEPT_LANGUAGE'];
}
if (($secrets['TDS_SITE_TOKEN'] ?? '') !== '') {
    $forward['X-Tds-Site-Token'] = $secrets['TDS_SITE_TOKEN'];
}

$body = null;
if (!in_array($method, ['GET', 'HEAD'], true)) {
    $body = (string) file_get_contents('php://input');
}

[$status, $headers, $responseBody, $error] = upstream_request($method, $url, $forward, $body);

if ($status === 0) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => 'Upstream unreachable', 'detail' => $error], JSON_UNESCAPED_SLASHES);
    exit;
}

http_response_code($status);
header('Content-Type: ' . ($headers['content-type'] ?? 'application/json; charset=utf-8'));
header('Cache-Control: no-store');
// Deliberately NOT forwarded: Set-Cookie (these sites read, they never log in,
// and a cookie scoped to the wrong domain is worse than none) and every CORS
// header (this response is same-origin, a stray Allow-Origin would only confuse).
if (isset($headers['content-disposition'])) {
    header('Content-Disposition: ' . $headers['content-disposition']);
}
echo $responseBody;

// --- helpers -----------------------------------------------------------------

/**
 * The real client IP.
 *
 * Behind Plesk's nginx the PHP process sees the proxy, so the first hop of
 * `X-Forwarded-For` is the visitor. That header is spoofable by anything that
 * can reach PHP-FPM directly — the same trade-off the API's own limiters make,
 * and it is only ever used for rate limiting, never for a security decision.
 */
function client_ip(): string
{
    $forwarded = (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($forwarded !== '') {
        $first = trim(explode(',', $forwarded)[0]);
        if ($first !== '') {
            return $first;
        }
    }

    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/**
 * Read the installer's secrets file.
 *
 * The exact inverse of `env_line()` in install.php — quoted values with `\`, `"`
 * and `$` escaped. Keeping this in step matters: a site token containing a `$`
 * would otherwise be forwarded with a stray backslash and rejected upstream.
 *
 * @return array<string,string>
 */
function read_secrets(string $file): array
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
            $val = substr($val, 1, -1);
        }
        $out[$key] = $val;
    }

    return $out;
}

/**
 * One upstream call. cURL when available, streams otherwise.
 *
 * @param array<string,string> $headers
 * @return array{0:int,1:array<string,string>,2:string,3:string}
 */
function upstream_request(string $method, string $url, array $headers, ?string $body): array
{
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
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        if ($body !== null && $body !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);

            return [0, [], '', $err];
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);

        return [$status, split_headers(substr((string) $raw, 0, $headSize)), substr((string) $raw, $headSize), ''];
    }

    if (!ini_get('allow_url_fopen')) {
        return [0, [], '', 'Neither cURL nor allow_url_fopen is available'];
    }

    $flat = '';
    foreach ($headers as $k => $v) {
        $flat .= $k . ': ' . $v . "\r\n";
    }
    $ctx = stream_context_create(['http' => [
        'method'        => $method,
        'header'        => $flat,
        'content'       => $body ?? '',
        'timeout'       => 20,
        'ignore_errors' => true,
    ]]);
    $out = @file_get_contents($url, false, $ctx);
    if ($out === false) {
        return [0, [], '', 'Upstream request failed'];
    }
    /** @var list<string> $http_response_header */
    $lines = $http_response_header ?? [];
    $status = 0;
    if (isset($lines[0]) && preg_match('#\s(\d{3})\s#', $lines[0] . ' ', $m)) {
        $status = (int) $m[1];
    }

    return [$status, split_headers(implode("\r\n", $lines)), $out, ''];
}

/** @return array<string,string> */
function split_headers(string $raw): array
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
