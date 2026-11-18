# AetherHost × Spacefast: three-minute product demo

## Purpose

This is a truthful, screen-recordable walkthrough for an Automattic/WordPress
audience. It demonstrates a practical hybrid workflow rather than claiming
that Spacefast replaces AetherHost or that AetherHost replaces WordPress.

## Before recording

- Use a disposable AetherHost tenant and a static application with `index.html`
  plus its CSS/JS assets saved in AetherHost.
- Confirm the AetherHost API readiness endpoint is healthy.
- If customer OAuth is configured, use a disposable Spacefast team; otherwise
  state on screen that the operator-managed private publisher is being used.
- Do not show API keys, tokens, environment-variable values, database records,
  or private Spacefast URLs.

## Run of show

### 0:00–0:25 — The problem and boundary

> “AetherHost is a multi-tenant control plane for workloads, data, deployment
> health, and AI-assisted creation. Spacefast is an optional static frontend
> target. They solve different pieces of the workflow, so this integration
> keeps the boundary explicit.”

Show the AetherHost console and one application. Point out its normal runtime
and deployment status.

### 0:25–0:55 — WordPress and other workloads stay first-class

> “A WordPress profile runs as a workload contract: nginx, PHP-FPM, MariaDB,
> and Redis are private components with health checks and memory-derived
> settings. The same platform can run a Node, Go, Rust, Python, or Docker API.”

Show the application/runtime selection or a prepared WordPress deployment
status. Do not claim benchmark numbers unless they are visible from a published
measurement report.

### 0:55–1:35 — Explicit static publishing

> “For a static UI, I select an application’s saved static export and approve
> that exact transfer. The platform accepts an `index.html` plus bounded safe
> assets only; it does not copy a repository, container, `.env`, database, or
> deployment directory.”

Show the **External frontend** panel, the consent checkbox, and the private
publish action. State that the Space is private by default.

### 1:35–2:05 — Safe asynchronous completion

> “Publishing is asynchronous, so AetherHost stores the provider operation and
> reconciles it on the server every minute. A user does not need to keep a tab
> open or manually poll. A failed upload reuses the saved private Space rather
> than creating a new one.”

Show the publishing state, then the final version/status after it completes.
If timing does not permit a live transition, use a prepared completed test and
say that it was recorded earlier—not that it happened live.

### 2:05–2:35 — Optional customer-owned connection

> “Teams can use AetherHost’s managed publisher, or connect their own
> Spacefast account. The customer-owned flow uses OAuth authorization code with
> PKCE, encrypted token storage, server-side refresh, team selection,
> disconnect, and an audit trail. Provider credentials never enter the browser
> or deployment logs.”

Show the connection state only. Do not complete an authorization flow during a
public recording unless using a disposable account.

### 2:35–3:00 — Why the integration is credible

> “The important part is not a logo integration. AetherHost retains API,
> workloads, databases, secrets, health, and domain controls; Spacefast gets an
> explicit static artifact. Provider failure cannot rewrite the workload or
> expose tenant secrets. That gives users a clear, reversible hybrid path.”

End on the deployed application and the AetherHost case-study/architecture
links.

## Evidence links for the accompanying post

- `docs/architecture/adr/017-wordpress-workload-profile.md`
- `docs/architecture/adr/019-operator-managed-external-frontend-publishing.md`
- `docs/architecture/adr/020-spacefast-customer-oauth.md`
- `docs/validation/2026-11-15-spacefast-private-publish.md`
- `docs/CASE_STUDY.md`

## Claims to avoid

- Do not call the Spacefast integration a replacement for WordPress hosting.
- Do not say tenant OAuth is live until the provider OAuth client has been
  registered and a disposable end-to-end connection has succeeded.
- Do not describe a private Space URL as publicly accessible.
- Do not claim performance, reliability, or scale metrics without a published
  test result and its test conditions.
