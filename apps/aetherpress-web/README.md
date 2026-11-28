# AetherPress Next.js frontend

This static Next.js frontend reads published research insights from the public
AetherPress Intelligence WordPress API. Article URLs use `#article-<id>` so
the same exported site can open and refresh an article on static hosting.
WordPress and SmartCrawler credentials must never be placed in this frontend.

Build with `pnpm --filter @aetherhost/aetherpress-web build`. Set the public
`NEXT_PUBLIC_WORDPRESS_URL` at build time to the HTTPS origin of the desired
WordPress site; it defaults to the AetherPress Intelligence demo. The export is
in `out/` and fetches current published content when visitors open it.

The current WordPress insight endpoint returns at most six items and plain text,
so the reader does not yet preserve rich block formatting or media. Unavailable
or empty feeds are reported explicitly rather than showing invented articles.

The current AetherHost Spacefast publisher only reads files saved under
`public/` or `dist/` on an application and does not build Next.js or ingest its
`out/` directory. A separate, validated export ingestion and deployment flow is
required before this frontend can be published from AetherHost. Do not replace
an existing application's source or publish state manually.

The demo has also been published separately to a private, operator-owned
Spacefast Space. That release is not an AetherHost dashboard-managed deployment,
and does not establish customer-owned account integration.
