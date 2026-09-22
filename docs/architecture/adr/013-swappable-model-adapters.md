# 013 - Swappable Model Adapters

## Context
Our LLM Proxy (`AiProxyService`) successfully governs AI requests by metering them and handling audit events. However, it previously hardcoded the stub response inline. To transition to real LLM providers while keeping the stub available for local development, we need an abstraction layer that handles the actual HTTP request to the model without altering the governance flow.

## Decision
We implemented a **Swappable Model Adapter** architecture using the Strategy and Factory patterns.
- `ModelAdapter` is an interface with a `complete()` method returning a standardized payload containing output text and token usage.
- `StubModelAdapter` returns zero-cost dummy text for local development.
- `OpenAICompatibleAdapter` hits any `/v1/chat/completions` endpoint, supporting OpenAI, Anthropic (via proxy), vLLM, or local models.
- `ModelFactory` dynamically returns the correct adapter based on the `AI_PROVIDER` and `OPENAI_API_KEY` environment variables.

Furthermore, we updated the proxy logic to **Authorize first, call model, meter on success**:
1. Check quota using `canAiRequest` (does not increment).
2. Call the selected adapter.
3. Upon success, transactionally consume the quota using `consumeAiRequestSlot` and emit the `AIRequestCompleted` event.

## Consequences
**Positive:**
- If an LLM provider returns a 500 error or times out, the tenant's quota is preserved. They are only billed for successful completions.
- Adding a new provider (e.g. Anthropic's native API) just requires writing a new class implementing `ModelAdapter` and updating the factory.
- Existing features, like `OpsInsightService`, remain completely untouched.

**Negative:**
- There is a minor race condition where two simultaneous requests could pass `canAiRequest`, but one would fail the atomic `consumeAiRequestSlot` after the model has already been called. In that case, we would burn a real API call without decrementing quota. For the scale of AetherHost, this is an acceptable tradeoff for preserving user quota on provider failures.
