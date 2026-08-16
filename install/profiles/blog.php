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
    ],

    'proxy_probe' => '/live-chat-cta/config?frontend=blog',

    'runtime_keys' => ['apiBase', 'contactUrl', 'liveChatFrontend'],

    'registry_sync' => false,
];
