use crate::model::{Action, EvaluationContext};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Effect {
    Allow,
    Deny,
}

/// A condition evaluated against the request context.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Condition {
    /// Subject and Resource must belong to the exact same tenant.
    SameTenant,
    /// Subject ID must match Resource owner_id.
    ResourceOwner,
    /// Resource must have an attribute matching the given key and value.
    ResourceAttributeEquals { key: String, value: String },
    /// Subject must have an attribute matching the given key and value.
    SubjectAttributeEquals { key: String, value: String },
}

impl Condition {
    pub fn evaluate(&self, ctx: &EvaluationContext) -> bool {
        match self {
            Condition::SameTenant => ctx.subject.tenant_id == ctx.resource.tenant_id,
            Condition::ResourceOwner => ctx.resource.owner_id.as_deref() == Some(&ctx.subject.id),
            Condition::ResourceAttributeEquals { key, value } => {
                ctx.resource.attributes.get(key) == Some(value)
            }
            Condition::SubjectAttributeEquals { key, value } => {
                ctx.subject.attributes.get(key) == Some(value)
            }
        }
    }
}

/// An authorization policy rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Policy {
    pub id: String,
    pub name: String,
    pub description: String,
    pub effect: Effect,
    pub priority: i32,
    pub target_roles: HashSet<String>,
    pub target_resource_kinds: HashSet<String>,
    pub target_actions: HashSet<Action>,
    pub conditions: Vec<Condition>,
    pub allow_all_roles: bool,
    pub allow_all_resources: bool,
    pub allow_all_actions: bool,
}

impl Policy {
    pub fn builder(id: impl Into<String>, effect: Effect) -> PolicyBuilder {
        PolicyBuilder::new(id, effect)
    }

    /// Evaluates whether this policy matches and applies to the given context.
    /// Expanded roles accounts for role inheritance.
    pub fn matches(&self, ctx: &EvaluationContext, expanded_roles: &HashSet<String>) -> bool {
        // 1. Role match
        if !self.allow_all_roles {
            let has_matching_role = self.target_roles.iter().any(|r| expanded_roles.contains(r));
            if !has_matching_role {
                return false;
            }
        }

        // 2. Resource kind match
        if !self.allow_all_resources && !self.target_resource_kinds.contains(&ctx.resource.kind) {
            return false;
        }

        // 3. Action match
        if !self.allow_all_actions && !self.target_actions.contains(&ctx.action) {
            return false;
        }

        // 4. Conditions match
        for cond in &self.conditions {
            if !cond.evaluate(ctx) {
                return false;
            }
        }

        true
    }
}

pub struct PolicyBuilder {
    policy: Policy,
}

impl PolicyBuilder {
    pub fn new(id: impl Into<String>, effect: Effect) -> Self {
        Self {
            policy: Policy {
                id: id.into(),
                name: String::new(),
                description: String::new(),
                effect,
                priority: 0,
                target_roles: HashSet::new(),
                target_resource_kinds: HashSet::new(),
                target_actions: HashSet::new(),
                conditions: Vec::new(),
                allow_all_roles: false,
                allow_all_resources: false,
                allow_all_actions: false,
            },
        }
    }

    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.policy.name = name.into();
        self
    }

    pub fn priority(mut self, priority: i32) -> Self {
        self.policy.priority = priority;
        self
    }

    pub fn any_role(mut self) -> Self {
        self.policy.allow_all_roles = true;
        self
    }

    pub fn role(mut self, role: impl Into<String>) -> Self {
        self.policy.target_roles.insert(role.into());
        self
    }

    pub fn any_resource(mut self) -> Self {
        self.policy.allow_all_resources = true;
        self
    }

    pub fn resource_kind(mut self, kind: impl Into<String>) -> Self {
        self.policy.target_resource_kinds.insert(kind.into());
        self
    }

    pub fn any_action(mut self) -> Self {
        self.policy.allow_all_actions = true;
        self
    }

    pub fn action(mut self, action: Action) -> Self {
        self.policy.target_actions.insert(action);
        self
    }

    pub fn same_tenant(mut self) -> Self {
        self.policy.conditions.push(Condition::SameTenant);
        self
    }

    pub fn resource_owner(mut self) -> Self {
        self.policy.conditions.push(Condition::ResourceOwner);
        self
    }

    pub fn condition(mut self, cond: Condition) -> Self {
        self.policy.conditions.push(cond);
        self
    }

    pub fn build(self) -> Policy {
        self.policy
    }
}

/// Role hierarchy mapping roles to implied inherited roles.
/// e.g. "admin" implies "editor", "editor" implies "viewer".
#[derive(Debug, Clone, Default)]
pub struct RoleHierarchy {
    // parent -> child roles
    inheritance: HashMap<String, HashSet<String>>,
}

impl RoleHierarchy {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_inheritance(&mut self, parent: impl Into<String>, child: impl Into<String>) {
        self.inheritance
            .entry(parent.into())
            .or_default()
            .insert(child.into());
    }

    /// Recursively expands all assigned roles to include inherited roles.
    pub fn expand_roles(&self, direct_roles: &HashSet<String>) -> HashSet<String> {
        let mut expanded = direct_roles.clone();
        let mut queue: Vec<String> = direct_roles.iter().cloned().collect();

        while let Some(current) = queue.pop() {
            if let Some(children) = self.inheritance.get(&current) {
                for child in children {
                    if expanded.insert(child.clone()) {
                        queue.push(child.clone());
                    }
                }
            }
        }

        expanded
    }
}
