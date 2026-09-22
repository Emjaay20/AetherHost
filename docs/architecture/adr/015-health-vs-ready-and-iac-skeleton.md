# 015 - Liveness vs. Readiness Probes and IaC Skeleton

## Context
As we prepare to deploy the AetherHost control plane to a production container orchestrator (e.g., Kubernetes / ACK or ECS), we need to provide the orchestrator with accurate signals about the application's state. Furthermore, we need a formalized way to describe the intended production architecture in code (Infrastructure as Code) without necessarily incurring the costs of provisioning it right now.

## Decision
We implemented **distinct Health (Liveness) and Readiness probes**, and created a **Terraform skeleton**:

1. **Liveness Probe (`/v1/health`)**: 
   - Indicates whether the Node.js/NestJS process is alive and able to accept HTTP connections.
   - If this fails, the orchestrator should *restart* the container.
   - It intentionally does *not* check the database, because a database outage should not cause all API pods to be aggressively killed and restarted.

2. **Readiness Probe (`/v1/ready`)**:
   - Executes a lightweight query (`SELECT 1`) against the PostgreSQL database.
   - Indicates whether the application is capable of serving real traffic.
   - If this fails, the orchestrator should *stop routing traffic* to the pod, but leave the pod running.

3. **Terraform Skeleton (`infrastructure/terraform/`)**:
   - Contains `main.tf`, `variables.tf`, `outputs.tf`, and `versions.tf`.
   - Documents the intended landing zone: an Alicloud VPC, Managed PostgreSQL (RDS), and container compute for the API.
   - Employs a `null_resource` to allow `terraform init` and `plan` to validate the structure without executing real cloud API calls or requiring actual credentials.

## Consequences
**Positive:**
- Complete SRE rigor: By differentiating between liveness and readiness, we prevent cascading failures during a database outage (pods won't endlessly crashloop).
- The infrastructure intention is explicitly documented and version-controlled.

**Negative:**
- The Terraform code is currently an unapplied skeleton. We are accepting the risk of drift between the documented infrastructure and a real deployment until an actual AWS/Alicloud account is linked.
