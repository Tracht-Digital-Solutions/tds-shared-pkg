<?php

declare(strict_types=1);

/**
 * Site profile — `tds-tools-frontend` (tools.tracht-digital.de).
 *
 * See `landingpage.php` for what each key means.
 *
 * This is the only profile with `registry_sync`. The tools site's build is
 * supposed to POST its composed catalog to `/tools/registry`, but
 * `.github/workflows/_build.yml` exports no `TOOLS_REGISTRY_TOKEN`, so
 * `src/lib/catalog.ts` skips the sync silently and the admin panel has never
 * seen the tool list. The installer does it host-side instead, which also keeps
 * the token off the CI runner.
 *
 * The three `/auth` and `/tools` entries are what `ToolGate.tsx` calls in the
 * browser: the session probe, the entitlement check and the Stripe checkout.
 * They carry the shared session cookie — same-origin here, so it rides along
 * without CORS credentials negotiation.
 */

return [
    'id'   => 'tools',
    'name' => 'Tools',

    'origins' => [
        'https://tools.tracht-digital.de',
    ],

    'public_routes' => [
        ['GET', '/tools/catalog', 'tools'],
    ],

    'proxy_allow' => [
        ['GET',  '#^/tools/catalog$#'],
        ['GET',  '#^/tools/entitlement$#'],
        ['POST', '#^/tools/checkout$#'],
        ['GET',  '#^/auth/me$#'],
        ['GET',  '#^/live-chat-cta/config$#'],
        ['POST', '#^/live-chat-cta/(chat|contact)$#'],
        ['GET',  '#^/live-chat-cta/chat/\d+/messages$#'],
        ['POST', '#^/live-chat-cta/chat/\d+/messages$#'],
        ['GET',  '#^/help/(faqs|articles)$#'],
        ['GET',  '#^/help/articles/[a-z0-9-]+$#'],
    ],

    'proxy_probe' => '/tools/catalog',

    // No `authBase`: ToolGate reaches the session through `${apiBase}/auth/me`,
    // so a separate auth base would be a key with no consumer — which this repo
    // already has one of (`PUBLIC_AUTH_API_URL`, declared in env.d.ts and read
    // by nothing). One is enough.
    'runtime_keys' => ['apiBase', 'loginUrl', 'liveChatFrontend'],

    'registry_sync' => true,
];
