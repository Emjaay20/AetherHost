# AetherPress Intelligence Hub demo

## What it demonstrates

**AetherPress Intelligence Hub** is a truthful WordPress, AetherHost,
SmartCrawler, and Spacefast integration:

| System | Responsibility |
| --- | --- |
| WordPress on AetherHost | The editor's source of truth, dashboard, drafts, and published insights. |
| AetherPress Intelligence plugin | Lets an editor request research from only approved HTTPS source domains, then imports completed material as a draft. |
| SmartCrawler | Performs the robots-aware, authenticated scrape under a dedicated API key and returns a durable job result. |
| AetherPress Launchpad | Reads public WordPress insights in the browser; it has no WordPress or SmartCrawler credential. |
| Spacefast | Privately serves only the reviewed static AetherPress export. It receives no WordPress files, database, source content, or crawler credential. |

This is a publishing workflow, not an automated-content publishing tool. A
crawl result is never public until a WordPress editor reviews and publishes its
draft.

## Platform setup

1. Create a normal **WordPress** application in AetherHost. Use the 1,024 MiB
   profile or larger. Complete the normal WordPress setup at
   `https://<app>.aetherhost.app/wp-admin` and create an administrator account.
2. Create a **dedicated SmartCrawler API key** with a low daily quota. Do not
   use the SmartCrawler administrator token. The API key is shown once; store
   it as an AetherHost application environment secret.
3. In the WordPress app's environment settings, add these values and redeploy:

   ```dotenv
   AETHERPRESS_INTELLIGENCE_ENABLED=true
   AETHERPRESS_INTELLIGENCE_CRAWLER_URL=https://smart-crawler.aetherhost.app
   AETHERPRESS_INTELLIGENCE_CRAWLER_TOKEN=sc_live_replace_with_dedicated_key
   AETHERPRESS_INTELLIGENCE_ALLOWED_SOURCES=https://developer.wordpress.org,https://wordpress.org
   ```

   `AETHERPRESS_INTELLIGENCE_ALLOWED_SOURCES` is a comma-separated list of
   HTTPS origins. The plugin refuses all other hosts, URLs with embedded
   credentials, and non-HTTPS URLs. Start with sites that you own or have
   permission to research.
4. Redeployment installs the plugin in WordPress's standard plugins directory.
   A one-time Must-Use migration loader keeps it available and activates it on
   the next administrator visit. After migration it appears in **Plugins → Active**
   and normal deactivation is respected. The crawler token is
   stored in the protected WordPress environment file, not in the plugin,
   frontend, or Spacefast archive.
5. In WordPress, open **Tools → AetherPress Intelligence**, enter a permitted
   source article, request research, then refresh its job. Once SmartCrawler
   reports `completed`, choose **Import as draft**. Review the draft in
   **Research insights**, then publish it deliberately.
6. Use **AetherPress Launchpad** in AetherHost with the WordPress site origin.
   It requests `/wp-json/aetherpress/v1/insights` first and falls back to the
   public WordPress posts feed when there are no reviewed insights.
7. After the Launchpad is healthy, open **Spacefast publishing**, expand only
   that app, approve the selected `public/` artifact, and publish privately.
   Check the provider operation before presenting the Spacefast link.

## Demo sequence and voiceover

This sequence is designed for a 3–4 minute recording. Do not show credentials,
environment values, admin tokens, or a private Spacefast URL.

1. **AetherHost applications (0:00–0:25).**

   > “This is the AetherHost control plane. It runs the WordPress workload,
   > preserves its database and uploads, and exposes the deployment health. The
   > research feature is an opt-in workload capability, not a hidden service.”

2. **WordPress dashboard (0:25–1:05).**

   > “WordPress remains the editorial source of truth. In the AetherPress
   > Intelligence tool, an editor can choose only an approved HTTPS source.
   > SmartCrawler accepts it as a quota-bound research job. Nothing is published
   > automatically.”

3. **Completed research job and draft (1:05–1:45).**

   > “When the crawl completes, the editor imports it as a WordPress draft.
   > Here is the review boundary: a person checks the source, edits the text,
   > and chooses whether to publish. The crawler's API key is never exposed to
   > the website visitor.”

4. **Published WordPress insight (1:45–2:10).**

   > “After approval, WordPress exposes only the public, reviewed insight using
   > a minimal REST endpoint. The endpoint does not reveal jobs, credentials, or
   > unreviewed material.”

5. **AetherPress Launchpad on AetherHost (2:10–2:45).**

   > “The AetherPress frontend is a separate AetherHost application. It reads
   > the public endpoint in the browser, so it has no WordPress login and no
   > SmartCrawler secret. If no insights are published, it safely falls back to
   > ordinary public posts.”

6. **Spacefast release (2:45–3:25).**

   > “Finally, I approve a narrowly scoped static export. AetherHost sends only
   > the public HTML, CSS, JavaScript and configuration files to Spacefast. The
   > WordPress runtime, database, crawler credentials, deployment controls, and
   > source project stay on AetherHost.”

## Guardrails to call out

- SmartCrawler's normal URL validation and robots handling remain in force.
- The plugin has an additional allow-list; it cannot crawl arbitrary hosts.
- The WordPress administrator must explicitly request a job and import it.
- Every imported item is a draft; publishing is a separate editorial action.
- The public API returns only published insights.
- The Spacefast output contains the static frontend only and needs explicit
  consent for every version.

## Recording notes

Use a screen recorder on your Mac/PC for the actual browser and WordPress
walkthrough. This repository supplies the exact onscreen actions and narration
above; replace the example source with a site you have permission to use. Keep
the Spacefast Space private for the demo and blur any internal provider URL.
