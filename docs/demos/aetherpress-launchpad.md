# AetherPress Launchpad demo

## What it proves

AetherPress Launchpad is a small, real demo project for presenting the
WordPress, AetherHost, and Spacefast relationship without implying that any
one system replaces the others.

| Product | Responsibility in this demo |
| --- | --- |
| WordPress | Publishes editorial posts through its public REST API. |
| AetherHost | Creates and runs the Launchpad application, records its deployment health, stores the explicit static export, and records consent for external publication. |
| Spacefast | Receives only the approved HTML, CSS, browser JavaScript, and configuration file as a private static frontend release. |

The Launchpad frontend requests only public post fields from
`/wp-json/wp/v2/posts`. It does not receive a WordPress administrator account,
application password, API token, database access, deployment directory, or an
AetherHost secret.

## Create the project

1. Deploy a normal WordPress workload in AetherHost and publish two or three
   posts. Confirm its public REST endpoint responds at
   `https://your-wordpress-site/wp-json/wp/v2/posts`.
2. In **Applications**, select **Create demo** in the **AetherPress Launchpad**
   card. Paste the public HTTPS WordPress site origin, not an endpoint or a
   credential.
3. AetherHost creates a small Node application with its backend entry point and
   package manifest at the app root, plus `public/index.html`, `public/styles.css`,
   `public/app.js`, and `public/config.js`. Its server exposes only `public/`.
   It runs normally on AetherHost and renders the latest three published posts
   from WordPress in the browser. After its first GitHub-backed deployment,
   AetherHost retains this manifest solely so the selected `public/` export can
   be published later; it clears the one-time write marker, so it will not
   replay the generated files over future repository changes.
4. Once the deployment is running, open **External frontend → Spacefast
   publishing**, expand the Launchpad row, approve the exact static export,
   and choose **Publish privately**.
5. Open the private Spacefast version while authenticated to Spacefast. It
   renders the same static frontend and reads only public WordPress posts at
   runtime. If that public feed is unavailable, it deliberately shows bundled
   sample content instead of exposing an error, secret, or deployment detail.

## Suggested three-minute recording

1. Show the WordPress workload in AetherHost and one published post.
2. Create AetherPress Launchpad using that WordPress site URL. Point out that
   the form accepts no secret and asks for no WordPress login.
3. Show the running Launchpad route and its **Live WordPress content** state.
4. In the compact Spacefast panel, open only the Launchpad row, show the
   consent text, and publish the selected static files privately.
5. Close by showing that the WordPress workload is still independent: its
   database, uploads, dashboard, plugins, deployment lifecycle, and domain
   remain in AetherHost.

## Claims to keep accurate

- This is a public-content integration. It is not a WordPress backup,
  migration, or administrative integration.
- Spacefast is optional and private by default. Publishing it does not update
  DNS or replace the AetherHost workload.
- Publishing selects only `public/`, re-roots those four frontend files in the
  Spacefast archive, and cannot expose `package.json` or `server.mjs`. Older
  root-level Launchpad apps should be recreated before publication.
- A browser can read the configured WordPress endpoint only when that endpoint
  is publicly reachable and permits normal cross-origin REST access.
