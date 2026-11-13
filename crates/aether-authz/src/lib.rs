//! # aether-authz
//!
//! High-performance fine-grained authorization engine (RBAC/ABAC) for AetherHost platform.
//!
//! Provides sub-microsecond in-memory policy evaluation, role inheritance,
//! tenant boundary enforcement, LRU evaluation caching, and structured audit logs.

pub mod actix;
pub mod audit;
pub mod cache;
pub mod engine;
pub mod middleware;
pub mod model;
pub mod policy;

pub use actix::{authorize_actix, ActixAuthzError, ActixAuthzErrorResponse};
pub use audit::{AuditRecord, AuditSink, InMemoryAuditSink, TracingAuditSink};
pub use cache::EvaluationCache;
pub use engine::{AuthzEngine, AuthzEngineBuilder};
pub use middleware::{authorize, AuthzError, AuthzErrorResponse};
pub use model::{Action, Decision, EvaluationContext, Resource, Subject};
pub use policy::{Condition, Effect, Policy, PolicyBuilder, RoleHierarchy};

/// Convenience macro for quick authorization checks inside handlers.
///
/// # Example
/// ```rust,no_run
/// use aether_authz::{check_permission, AuthzEngine, EvaluationContext};
/// # fn dummy(engine: &AuthzEngine, ctx: &EvaluationContext) -> Result<(), aether_authz::AuthzError> {
/// check_permission!(engine, ctx);
/// # Ok(())
/// # }
/// ```
#[macro_export]
macro_rules! check_permission {
    ($engine:expr, $ctx:expr) => {
        $crate::middleware::authorize($engine, $ctx)?
    };
}
