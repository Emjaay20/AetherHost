# AetherHost Infrastructure Skeleton

This directory contains the intended Cloud Landing Zone for the AetherHost control plane. 

**DO NOT APPLY THIS WITHOUT REAL CREDENTIALS AND STATE CONFIGURATION.**

This is a skeleton that demonstrates how the NestJS API (with its specific liveness `/v1/health` and readiness `/v1/ready` probes) maps to actual managed infrastructure (Alibaba Cloud ACK/ECS + Managed PostgreSQL).
