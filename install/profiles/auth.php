<?php

declare(strict_types=1);

/**
 * Site profile — `tds-auth-frontend` (auth.tracht-digital.de).
 *
 * See `landingpage.php` for what each key means. Two of them exist only because
 * of this profile, and both encode something that is otherwise invisible:
 *
 *   proxy       false — see below. The one key whose default is dangerous here.
 *   probe_base  'auth' — `public_routes` resolve against the Auth-API-URL the
 *               operator typed, not the gateway base. Today auth sits under the
 *               gateway and the two agree; the day it does not, resolving
 *               against the gateway would report a green check for a host this
 *               site never calls.
 */

return [
    'id'   => 'auth',
    'name' => 'Zentrale Anmeldung',

    'origins' => [
        'https://auth.tracht-digital.de',
    ],

    // The one public route of tds-auth-api, and a genuinely diagnostic one:
    // `keys: 0` means `composer keygen` never ran on the API host. Every login
    // then fails signature verification on every other service, and nothing
    // anywhere goes red — the JWKS endpoint answers a perfectly valid 200.
    'public_routes' => [
        ['GET', '/.well-known/jwks.json', 'keys'],
    ],

    'probe_base' => 'auth',

    // The preflight that matters here. /contact (the default) is a route this
    // site never calls; POST /auth/login is the request every visitor makes,
    // and a missing Allow-Origin on it means nobody can sign in anywhere.
    'cors_probe' => ['POST', '/auth/login'],

    // A credentialed preflight is a stricter test, and the right one here: a
    // browser REJECTS `Allow-Origin: *` outright when the request carries
    // cookies. Without this flag a CDN or WAF rewriting the header to `*`
    // would pass the check and break every sign-in — and nothing else.
    'cors_credentials' => true,

    // NO PROXY, and this is not a preference. `proxy.php` deliberately drops
    // `Set-Cookie` ("these sites read, they never log in") — but this site does
    // nothing except log people in. Routed through the proxy, `POST /login`
    // would answer 200 with no session cookie ever reaching the browser: a
    // success message, a login that did not happen, and no error to find.
    // Hence also no `proxy_allow` and no `proxy_probe`.
    'proxy'       => false,
    'proxy_allow' => [],

    // `loginUrl` is deliberately absent — this site IS the login page, so a key
    // telling it where to send someone who needs to sign in would point at
    // itself.
    'runtime_keys' => ['apiBase', 'authBase'],

    'registry_sync' => false,
];
