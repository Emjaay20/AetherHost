use crate::model::{Action, Decision, EvaluationContext};
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CacheKey {
    pub subject_id: String,
    pub tenant_id: String,
    pub resource_kind: String,
    pub resource_id: String,
    pub action: Action,
}

impl CacheKey {
    pub fn from_context(ctx: &EvaluationContext) -> Self {
        Self {
            subject_id: ctx.subject.id.clone(),
            tenant_id: ctx.subject.tenant_id.clone(),
            resource_kind: ctx.resource.kind.clone(),
            resource_id: ctx.resource.id.clone(),
            action: ctx.action.clone(),
        }
    }
}

#[derive(Debug, Clone)]
struct CachedEntry {
    decision: Decision,
    expires_at: Instant,
}

/// Thread-safe in-memory authorization decision cache with TTL and granular invalidation.
#[derive(Debug, Clone)]
pub struct EvaluationCache {
    entries: Arc<RwLock<HashMap<CacheKey, CachedEntry>>>,
    ttl: Duration,
    max_capacity: usize,
}

impl EvaluationCache {
    pub fn new(ttl: Duration, max_capacity: usize) -> Self {
        Self {
            entries: Arc::new(RwLock::new(HashMap::with_capacity(max_capacity.min(4096)))),
            ttl,
            max_capacity,
        }
    }

    pub fn get(&self, ctx: &EvaluationContext) -> Option<Decision> {
        let key = CacheKey::from_context(ctx);
        let now = Instant::now();

        let map = self.entries.read().ok()?;
        if let Some(entry) = map.get(&key) {
            if entry.expires_at > now {
                return Some(entry.decision.clone());
            }
        }
        None
    }

    pub fn insert(&self, ctx: &EvaluationContext, decision: Decision) {
        let key = CacheKey::from_context(ctx);
        let expires_at = Instant::now() + self.ttl;

        if let Ok(mut map) = self.entries.write() {
            // Simple bound eviction if exceeding capacity
            if map.len() >= self.max_capacity {
                map.clear();
            }
            map.insert(
                key,
                CachedEntry {
                    decision,
                    expires_at,
                },
            );
        }
    }

    pub fn invalidate_tenant(&self, tenant_id: &str) {
        if let Ok(mut map) = self.entries.write() {
            map.retain(|key, _| key.tenant_id != tenant_id);
        }
    }

    pub fn invalidate_subject(&self, subject_id: &str) {
        if let Ok(mut map) = self.entries.write() {
            map.retain(|key, _| key.subject_id != subject_id);
        }
    }

    pub fn invalidate_resource(&self, resource_id: &str) {
        if let Ok(mut map) = self.entries.write() {
            map.retain(|key, _| key.resource_id != resource_id);
        }
    }

    pub fn clear(&self) {
        if let Ok(mut map) = self.entries.write() {
            map.clear();
        }
    }

    pub fn len(&self) -> usize {
        self.entries.read().map(|m| m.len()).unwrap_or(0)
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}
