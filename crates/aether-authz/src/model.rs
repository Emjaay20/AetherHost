use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Identifies the actor requesting access.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Subject {
    pub id: String,
    pub tenant_id: String,
    pub roles: HashSet<String>,
    pub attributes: HashMap<String, String>,
}

impl Subject {
    pub fn new(id: impl Into<String>, tenant_id: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            tenant_id: tenant_id.into(),
            roles: HashSet::new(),
            attributes: HashMap::new(),
        }
    }

    pub fn with_role(mut self, role: impl Into<String>) -> Self {
        self.roles.insert(role.into());
        self
    }

    pub fn with_roles<I, S>(mut self, roles: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for r in roles {
            self.roles.insert(r.into());
        }
        self
    }

    pub fn with_attribute(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.attributes.insert(key.into(), value.into());
        self
    }

    pub fn is_tenant_admin(&self) -> bool {
        self.roles.contains("admin") || self.roles.contains("tenant_admin")
    }
}

/// Identifies the target resource being accessed.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Resource {
    pub kind: String,
    pub id: String,
    pub tenant_id: String,
    pub owner_id: Option<String>,
    pub attributes: HashMap<String, String>,
}

impl Resource {
    pub fn new(
        kind: impl Into<String>,
        id: impl Into<String>,
        tenant_id: impl Into<String>,
    ) -> Self {
        Self {
            kind: kind.into(),
            id: id.into(),
            tenant_id: tenant_id.into(),
            owner_id: None,
            attributes: HashMap::new(),
        }
    }

    pub fn with_owner(mut self, owner_id: impl Into<String>) -> Self {
        self.owner_id = Some(owner_id.into());
        self
    }

    pub fn with_attribute(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.attributes.insert(key.into(), value.into());
        self
    }
}

/// Action to be performed on a resource.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Read,
    Write,
    Create,
    Delete,
    Execute,
    Admin,
    Custom(String),
}

impl Action {
    pub fn as_str(&self) -> &str {
        match self {
            Action::Read => "read",
            Action::Write => "write",
            Action::Create => "create",
            Action::Delete => "delete",
            Action::Execute => "execute",
            Action::Admin => "admin",
            Action::Custom(s) => s.as_str(),
        }
    }
}

impl<S: Into<String>> From<S> for Action {
    fn from(s: S) -> Self {
        let text = s.into();
        match text.to_lowercase().as_str() {
            "read" => Action::Read,
            "write" => Action::Write,
            "create" => Action::Create,
            "delete" => Action::Delete,
            "execute" => Action::Execute,
            "admin" => Action::Admin,
            _ => Action::Custom(text),
        }
    }
}

/// Context passed to the authorization engine for evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationContext {
    pub subject: Subject,
    pub resource: Resource,
    pub action: Action,
    pub client_ip: Option<String>,
    pub timestamp_epoch_secs: u64,
}

impl EvaluationContext {
    pub fn new(subject: Subject, resource: Resource, action: Action) -> Self {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        Self {
            subject,
            resource,
            action,
            client_ip: None,
            timestamp_epoch_secs: now,
        }
    }

    pub fn with_client_ip(mut self, ip: impl Into<String>) -> Self {
        self.client_ip = Some(ip.into());
        self
    }
}

/// Decision returned by the policy engine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Decision {
    Allow {
        matched_policy_id: Option<String>,
        reason: String,
    },
    Deny {
        matched_policy_id: Option<String>,
        reason: String,
    },
}

impl Decision {
    pub fn is_allowed(&self) -> bool {
        matches!(self, Decision::Allow { .. })
    }

    pub fn reason(&self) -> &str {
        match self {
            Decision::Allow { reason, .. } => reason.as_str(),
            Decision::Deny { reason, .. } => reason.as_str(),
        }
    }
}
