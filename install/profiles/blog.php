<?php

declare(strict_types=1);

/**
 * Site profile — `tds-blog-frontend` (blog.tracht-digital.de).
 *
 * See `landingpage.php` for what each key means.
 *
 * The blog reads `/content/landing` too, even though it is not the landing
 * page: its cookie-banner switch and its AdSense configuration live in that
 * site's content blocks (`src/lib/content-api.ts`). Leaving it out of the smoke
 * test would hide exactly the case where ads and the banner silently vanish.
 */

return [
    'id'   => 'blog',
    'name' => 'Blog',

    'origins' => [
        'https://blog.tracht-digital.de',
    ],

    'public_routes' => [
        ['GET', '/content/blog?limit=3&lang=de', 'posts'],
        ['GET', '/content/snippets', 'snippets'],
        ['GET', '/content/landing?lang=de', 'blocks'],
    ],

    'proxy_allow' => [
        // The newsletter island posts to the same public contact endpoint.
        ['POST', '#^/contact$#'],
        // Per-post view beacon (navigator.sendBeacon, once per session).
        ['POST', '#^/content/blog/[a-z0-9-]+/view$#'],
        ['GET',  '#^/live-chat-cta/config$#'],
        ['POST', '#^/live-chat-cta/(chat|contact)$#'],
        ['GET',  '#^/live-chat-cta/chat/\d+/messages$#'],
        ['POST', '#^/live-chat-cta/chat/\d+/messages$#'],
        ['GET',  '#^/help/(faqs|articles)$#'],
        ['GET',  '#^/help/articles/[a-z0-9-]+$#'],
        // The header's account menu probes the shared session, exactly as the
        // tools site's gate does. READ only: signing out goes straight to the
        // absolute auth origin, because proxy.php deliberately drops
        // Set-Cookie and a logout through here would report success and end
        // nothing.
        ['GET',  '#^/auth/me$#'],
    ],

    'proxy_probe' => '/live-chat-cta/config?frontend=blog',

    // `loginUrl` rides along with that probe: a site that can discover a
    // session but has nowhere to send someone who lacks one is half configured.
    'runtime_keys' => ['apiBase', 'loginUrl', 'contactUrl', 'liveChatFrontend'],

    'registry_sync' => false,
];
