<?php

declare(strict_types=1);

/**
 * Site profile — `tds-landingpage-frontend` (tracht-digital.de).
 *
 * Copied to `_setup/profile.php` by that repo's `scripts/sync-installer.mjs`.
 * This array is the ONLY place the three sites differ; `install.php` and
 * `proxy.php` are byte-identical everywhere.
 *
 * Keys:
 *   id             stable slug — also the `?frontend=` label the live-chat
 *                  widget identifies itself with
 *   name           what the wizard shows
 *   origins        every origin a browser may reach this site on; each gets its
 *                  own CORS preflight in the check step
 *   public_routes  [method, path, count-key] — the count key is what makes the
 *                  smoke test meaningful: these routes answer 200 with an empty
 *                  payload when the DB is empty or unreachable
 *   proxy_allow    [method, pattern] — exactly the calls the BROWSER makes.
 *                  Build-time content fetches are deliberately absent: they run
 *                  on a GitHub runner, never through this host
 *   proxy_probe    a GET inside `proxy_allow` used to verify the live proxy
 *   runtime_keys   which keys `tds-runtime.json` carries for this site; must
 *                  stay in step with `RUNTIME_KEYS` in `src/api/index.ts`
 *                  (`installer.test.ts` fails the build otherwise)
 *
 * Four optional keys, all defaulting to what the content sites need:
 *
 *   proxy          default true. `false` removes the same-origin proxy as a
 *                  choice, because `proxy.php` drops `Set-Cookie` — a site
 *                  that logs people in must never be offered it (`auth.php`)
 *   probe_base     default 'api'. `'auth'` resolves `public_routes` against
 *                  the Auth-API-URL instead of the gateway base
 *   cors_probe     default `['POST', '/contact']`. The [method, path] the
 *                  preflight check uses; it has to be a route this site
 *                  really calls, or a green check means nothing
 *   cors_credentials  default false. true also requires
 *                  `Allow-Credentials: true` and REFUSES a `*` origin — a
 *                  browser rejects the wildcard once cookies are attached
 */

return [
    'id'   => 'landingpage',
    'name' => 'Landingpage',

    // www. matters: a visitor landing there posts the contact form from a
    // different origin, and a missing Allow-Origin fails silently — the form
    // just never submits.
    'origins' => [
        'https://tracht-digital.de',
        'https://www.tracht-digital.de',
    ],

    'public_routes' => [
        ['GET', '/content/landing?lang=de', 'blocks'],
        ['GET', '/content/blog?limit=3&lang=de', 'posts'],
        ['GET', '/content/legal', 'docs'],
    ],

    'proxy_allow' => [
        ['POST', '#^/contact$#'],
        ['GET',  '#^/live-chat-cta/config$#'],
        ['POST', '#^/live-chat-cta/(chat|contact)$#'],
        ['GET',  '#^/live-chat-cta/chat/\d+/messages$#'],
        ['POST', '#^/live-chat-cta/chat/\d+/messages$#'],
        ['GET',  '#^/help/(faqs|articles)$#'],
        ['GET',  '#^/help/articles/[a-z0-9-]+$#'],
    ],

    'proxy_probe' => '/live-chat-cta/config?frontend=landingpage',

    'runtime_keys' => ['apiBase', 'contactUrl', 'liveChatFrontend'],

    'registry_sync' => false,
];
