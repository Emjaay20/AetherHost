use crate::{
    audit::{AuditRecord, AuditSink, TracingAuditSink},
    cache::EvaluationCache,
    model::{Decision, EvaluationContext},
    policy::{Effect, Policy, RoleHierarchy},
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

/// High-performance authorization engine.
#[derive(Clone)]
pub struct AuthzEngine {
    policies: Arc<Vec<Policy>>,
    role_hierarchy: Arc<RoleHierarchy>,
    cache: EvaluationCache,
    audit_sink: Arc<dyn AuditSink>,
}

impl AuthzEngine {
    pub fn builder() -> AuthzEngineBuilder {
        AuthzEngineBuilder::new()
    }

    /// Evaluates access permissions against registered policies.
    /// Evaluation order:
    /// 1. Check in-memory LRU evaluation cache (sub-microsecond return).
    /// 2. Expand subject roles through role inheritance hierarchy.
    /// 3. Evaluate matching policies sorted by priority (higher priority first).
    /// 4. Explicit `Deny` terminates immediately.
    /// 5. First matching `Allow` allows access.
    /// 6. Default closed: if no policy matches, returns `Deny`.
    pub fn evaluate(&self, ctx: &EvaluationContext) -> Decision {
        let start = Instant::now();

        // 1. Cache hit check
        if let Some(cached_decision) = self.cache.get(ctx) {
            return cached_decision;
        }

        // 2. Expand role inheritance
        let expanded_roles = self.role_hierarchy.expand_roles(&ctx.subject.roles);

        // 3. Evaluate policies in priority order
        let mut final_decision = Decision::Deny {
            matched_policy_id: None,
            reason: "Default closed: no policy granted access".to_string(),
        };

        for policy in self.policies.iter() {
            if policy.matches(ctx, &expanded_roles) {
                match policy.effect {
                    Effect::Deny => {
                        final_decision = Decision::Deny {
                            matched_policy_id: Some(policy.id.clone()),
                            reason: format!("Explicit deny policy '{}' triggered", policy.name),
                        };
                        break;
                    }
                    Effect::Allow => {
                        final_decision = Decision::Allow {
                            matched_policy_id: Some(policy.id.clone()),
                            reason: format!("Allowed by policy '{}'", policy.name),
                        };
                        break;
                    }
                }
            }
        }

        let elapsed = start.elapsed().as_nanos() as u64;

        // 4. Update cache
        self.cache.insert(ctx, final_decision.clone());

        // 5. Emit audit event
        self.audit_sink.record(AuditRecord {
            subject_id: ctx.subject.id.clone(),
            tenant_id: ctx.subject.tenant_id.clone(),
            resource_kind: ctx.resource.kind.clone(),
            resource_id: ctx.resource.id.clone(),
            action: ctx.action.clone(),
            decision: final_decision.clone(),
            duration_nanos: elapsed,
            timestamp_epoch_secs: ctx.timestamp_epoch_secs,
        });

        final_decision
    }

    /// Invalidate cache for a specific tenant (e.g. after permissions change).
    pub fn invalidate_tenant(&self, tenant_id: &str) {
        self.cache.invalidate_tenant(tenant_id);
    }

    /// Invalidate cache for a specific subject (e.g. user role reassigned).
    pub fn invalidate_subject(&self, subject_id: &str) {
        self.cache.invalidate_subject(subject_id);
    }

    /// Invalidate cache for a specific resource.
    pub fn invalidate_resource(&self, resource_id: &str) {
        self.cache.invalidate_resource(resource_id);
    }

    pub fn cache(&self) -> &EvaluationCache {
        &self.cache
    }
}

pub struct AuthzEngineBuilder {
    policies: Vec<Policy>,
    role_hierarchy: RoleHierarchy,
    cache_ttl: Duration,
    cache_capacity: usize,
    audit_sink: Arc<dyn AuditSink>,
}

impl AuthzEngineBuilder {
    pub fn new() -> Self {
        Self {
            policies: Vec::new(),
            role_hierarchy: RoleHierarchy::new(),
            cache_ttl: Duration::from_secs(60),
            cache_capacity: 10_000,
            audit_sink: Arc::new(TracingAuditSink),
        }
    }

    pub fn with_policy(mut self, policy: Policy) -> Self {
        self.policies.push(policy);
        self
    }

    pub fn with_policies<I: IntoIterator<Item = Policy>>(mut self, policies: I) -> Self {
        self.policies.extend(policies);
        self
    }

    pub fn with_role_inheritance(
        mut self,
        parent: impl Into<String>,
        child: impl Into<String>,
    ) -> Self {
        self.role_hierarchy.add_inheritance(parent, child);
        self
    }

    pub fn with_cache_ttl(mut self, ttl: Duration) -> Self {
        self.cache_ttl = ttl;
        self
    }

    pub fn with_cache_capacity(mut self, capacity: usize) -> Self {
        self.cache_capacity = capacity;
        self
    }

    pub fn with_audit_sink(mut self, sink: Arc<dyn AuditSink>) -> Self {
        self.audit_sink = sink;
        self
    }

    pub fn build(mut self) -> AuthzEngine {
        // Sort policies by priority descending
        self.policies.sort_by_key(|b| std::cmp::Reverse(b.priority));

        AuthzEngine {
            policies: Arc::new(self.policies),
            role_hierarchy: Arc::new(self.role_hierarchy),
            cache: EvaluationCache::new(self.cache_ttl, self.cache_capacity),
            audit_sink: self.audit_sink,
        }
    }
}

impl Default for AuthzEngineBuilder {
    fn default() -> Self {
        Self::new()
    }
}
