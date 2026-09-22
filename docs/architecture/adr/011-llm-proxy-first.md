# 011 - LLM Proxy First

## Context
As we introduce Applied AI features (e.g. log summarization, insights) to AetherHost, we need a mechanism to securely call LLM providers. Allowing the dashboard frontend or future runtimes to call OpenAI directly violates our platform's commercial boundaries. We must authorize, meter, and audit every AI request before it burns real tokens.

## Decision
We implemented a dedicated **LLM Proxy Skeleton** within the control plane (`apps/api/src/ai/`).
- `POST /v1/ai/complete` acts as the single gateway for all AI completions.
- Requests are immediately authorized against `TenantEntitlement.usageAiRequests`.
- A transaction consumes the quota and emits an `AIRequestCompleted` domain event before returning.
- The initial implementation is a pure **Stub**. It returns fake completion data and pseudo-calculated token costs.

## Consequences
**Positive:**
- We establish the complete "Control Path" (entitlements → API → billing/audit) without paying a cent to OpenAI.
- Frontend features can be developed against a stable, low-latency mock.
- Real provider adapters (OpenAI, Anthropic) can be injected later without changing the API signature or authorization logic.

**Negative:**
- The proxy adds a network hop, but since it's currently in-process with the control plane, this is negligible.
- Cost calculations are simulated for now.

## Notes
The fact that AI completions consume quota using the exact same atomic `UPDATE` pattern as physical application provisioning proves the robustness of the platform's entitlement model. AI is just another metered resource.
