# 012 - Ops Insight Uses Proxy

## Context
We want to introduce AI features that summarize operational state, such as an "Ops Insight" briefing for a tenant. If this feature connects directly to an LLM provider, we bypass our platform's commercial gatekeeping (entitlements, metering, auditing) created in the LLM Proxy. 

## Decision
We implemented `OpsInsightService` as an internal client of `AiProxyService`.
- The service loads up to 20 applications and 30 events for a given tenant from Postgres.
- It formulates a system prompt containing this JSON snapshot.
- It calls `AiProxyService.complete` using the `ops_insight` purpose.
- The resulting payload returns the proxy's stub text, cost, and the snapshot metrics.

## Consequences
**Positive:**
- This proves our platform-first design. New AI-driven product features can be added rapidly without duplicating billing or authorization logic.
- The `AiProxyService` handles quota decrementing. If a tenant runs out of AI requests, the `OpsInsightService` naturally fails with a `403 Forbidden`.
- Every insight generation is securely logged in the `DomainEventRecord` as an `AIRequestCompleted` event.

**Negative:**
- We are currently passing raw JSON data into the LLM prompt. As the number of events scales, this could exceed context limits. Future iterations will require summarizing or truncating the event payloads before injecting them into the prompt.
