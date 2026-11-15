# ADR 018: AI-generated deployments use the workload contract

## Status

Accepted

## Context

The AI Architect previously asked a model to generate a complete Compose file
and then stored it beside generated source. Although the agent rendered its own
runtime Compose later, it still parsed a Traefik port label from the AI's
Compose. That mixed an untrusted, broad infrastructure description into a
platform-owned deployment path and made it easier for a shallow placeholder
application to look successful.

## Decision

AI provisioning now accepts only a bounded contract: application name, the
fixed `docker` runtime, source files, a port, and a safe HTTP health path.
The model is explicitly forbidden from generating Compose, routes, networks,
mounts, privileges, resource settings, or secret injection. The Go agent
ignores the legacy `dockerCompose` field when deriving runtime behavior and
generates routing and Compose itself.

## Consequences

- AI-generated applications cannot influence host mounts, Docker sockets,
  privileges, container topology, or ingress labels through Compose text.
- Explicit health paths remain part of the deployment contract, so readiness
  checks can verify real application behavior.
- Existing records retain their historical `dockerCompose` text for audit and
  compatibility, but the agent does not execute or parse it.
- A project needing a custom multi-process graph uses the reviewed workload
  contract rather than AI-supplied Compose.
