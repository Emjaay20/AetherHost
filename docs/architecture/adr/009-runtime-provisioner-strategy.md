# 009 - Runtime Provisioner Strategy

## Context
AetherHost supports multiple runtimes (`wordpress`, `nodejs`, `python`, `php`). Each runtime requires fundamentally different provisioning logic: Node.js needs PM2/process managers, WordPress needs PHP-FPM and MySQL config, Python needs a virtualenv and Uvicorn/Gunicorn. If we put this logic into `ProvisioningService`, it will become an unmaintainable monolith of `if/else` statements.

## Decision
We adopted the **Strategy Pattern** for runtime provisioning.
- `ProvisioningService` has no knowledge of how to provision a specific runtime. It only understands transitioning `PENDING` apps to `RUNNING` or `FAILED`.
- We introduced a `ProvisionerFactory` that maps a runtime string (e.g. `wordpress`) to a specific implementation of the `RuntimeProvisioner` interface.
- Each runtime provides its own stub (e.g. `WordpressProvisioner`, `NodejsProvisioner`) that returns runtime-specific metadata.
- Unknown runtimes fail early with a `400 BadRequest`.

## Consequences
**Positive:**
- **Open/Closed Principle:** Adding a new runtime (e.g. `go` or `rust`) requires adding a new class and registering it in the factory, without touching `ProvisioningService`.
- **Decoupled Evolution:** The `RuntimeProvisioner` interface forces all provisioners to adhere to a standard contract (`provision(id, tenant, runtime)`).
- **Testability:** Each provisioner can be unit tested in isolation.

**Negative:**
- We now have multiple stub files that do very little right now, adding slight boilerplate to the repository.

## Notes
The specific messages returned by the stubs are now captured in the `ApplicationStatusChanged` event payload. This proves that the strategy correctly routes to the specific provisioner and leaves an auditable trail of what actions the provisioner supposedly performed.
