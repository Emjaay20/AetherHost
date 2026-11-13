use crate::model::{Action, Decision};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};
use tracing::info;

/// A recorded authorization decision for security compliance and audit trails.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditRecord {
    pub subject_id: String,
    pub tenant_id: String,
    pub resource_kind: String,
    pub resource_id: String,
    pub action: Action,
    pub decision: Decision,
    pub duration_nanos: u64,
    pub timestamp_epoch_secs: u64,
}

pub trait AuditSink: Send + Sync {
    fn record(&self, record: AuditRecord);
}

/// Simple logger audit sink that emits tracing info events.
pub struct TracingAuditSink;

impl AuditSink for TracingAuditSink {
    fn record(&self, record: AuditRecord) {
        info!(
            target: "aether::audit",
            subject = %record.subject_id,
            tenant = %record.tenant_id,
            resource_kind = %record.resource_kind,
            resource_id = %record.resource_id,
            action = ?record.action,
            allowed = %record.decision.is_allowed(),
            reason = %record.decision.reason(),
            duration_nanos = %record.duration_nanos,
            "Authorization decision evaluated"
        );
    }
}

/// In-memory ring buffer audit sink useful for inspection, debugging, and tests.
#[derive(Debug, Clone)]
pub struct InMemoryAuditSink {
    records: Arc<Mutex<VecDeque<AuditRecord>>>,
    capacity: usize,
}

impl InMemoryAuditSink {
    pub fn new(capacity: usize) -> Self {
        Self {
            records: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
            capacity,
        }
    }

    pub fn all(&self) -> Vec<AuditRecord> {
        self.records
            .lock()
            .map(|r| r.iter().cloned().collect())
            .unwrap_or_default()
    }

    pub fn count(&self) -> usize {
        self.records.lock().map(|r| r.len()).unwrap_or(0)
    }
}

impl AuditSink for InMemoryAuditSink {
    fn record(&self, record: AuditRecord) {
        if let Ok(mut records) = self.records.lock() {
            if records.len() >= self.capacity {
                records.pop_front();
            }
            records.push_back(record);
        }
    }
}
