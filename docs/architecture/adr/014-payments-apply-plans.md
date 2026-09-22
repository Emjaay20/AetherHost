# 014 - Payments Apply Plans

## Context
AetherHost uses an entitlements engine to strictly govern resource consumption (e.g. `limitApplications`, `limitAiRequests`). To monetize the platform, we need to integrate payment providers like Stripe and Paystack without coupling them to our core platform services (hosting, AI proxy).

## Decision
We chose a **Catalog-driven, Event-based Webhook** architecture.
- `CatalogPlan` definitions live in `@aetherhost/domain`.
- A dedicated `BillingService` handles incoming webhooks from payment providers.
- Webhook endpoints (`/v1/billing/webhooks/stripe`, `/v1/billing/webhooks/paystack`) parse signatures and extract a `providerEventId`, `tenantId`, and `planId`.
- **Idempotency is non-negotiable**: Webhooks insert a unique `WebhookEvent` row in the same transaction that applies the plan. If the `providerEventId` already exists, the service returns 200 OK and does nothing.
- After passing idempotency checks, `BillingService` delegates to `EntitlementsService.applyPlan()`, raising the limits on the existing `TenantEntitlement` row. Usage is explicitly *not* zeroed out (Growth plan just raises the ceiling).
- Finally, it emits a `PaymentSucceeded` domain event.

## Consequences
**Positive:**
- Complete decoupling: The control plane and AI proxy have no knowledge of Stripe or Paystack.
- Extreme resiliency: Idempotent webhooks mean payment providers can aggressively retry without ever double-granting quota.
- Seamless demoing: A `/simulate` route allows testing the entire payment flow (and asserting idempotency) without actual credit cards or provider keys.

**Negative:**
- We do not currently handle downgrade webhooks (subscription cancellations), which would require lowering limits without breaking existing running workloads. This will be addressed in a future ADR.
