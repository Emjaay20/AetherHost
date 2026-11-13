use aether_authz::{
    Action, AuthzEngine, Condition, Effect, EvaluationContext, InMemoryAuditSink, Policy, Resource,
    Subject,
};
use std::{sync::Arc, time::Duration};

#[test]
fn test_default_closed_denies_unmatched() {
    let engine = AuthzEngine::builder().build();

    let subject = Subject::new("user_1", "tenant_a");
    let resource = Resource::new("application", "app_1", "tenant_a");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    let decision = engine.evaluate(&ctx);
    assert!(!decision.is_allowed());
    assert!(decision.reason().contains("Default closed"));
}

#[test]
fn test_allow_policy_grants_access() {
    let policy = Policy::builder("pol_read_app", Effect::Allow)
        .name("Allow Read Application")
        .role("developer")
        .resource_kind("application")
        .action(Action::Read)
        .same_tenant()
        .build();

    let engine = AuthzEngine::builder().with_policy(policy).build();

    let subject = Subject::new("user_1", "tenant_a").with_role("developer");
    let resource = Resource::new("application", "app_1", "tenant_a");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    let decision = engine.evaluate(&ctx);
    assert!(decision.is_allowed());
    assert!(decision.reason().contains("Allow Read Application"));
}

#[test]
fn test_multi_tenant_boundary_enforcement() {
    let policy = Policy::builder("pol_read_app", Effect::Allow)
        .name("Allow Read Application")
        .role("developer")
        .resource_kind("application")
        .action(Action::Read)
        .same_tenant()
        .build();

    let engine = AuthzEngine::builder().with_policy(policy).build();

    // Subject in tenant_a trying to access resource in tenant_b
    let subject = Subject::new("user_1", "tenant_a").with_role("developer");
    let resource = Resource::new("application", "app_2", "tenant_b");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    let decision = engine.evaluate(&ctx);
    assert!(!decision.is_allowed(), "Cross-tenant access must be denied");
}

#[test]
fn test_explicit_deny_overrides_allow() {
    let allow_policy = Policy::builder("pol_allow_all", Effect::Allow)
        .name("Allow All Writes")
        .role("developer")
        .resource_kind("application")
        .action(Action::Write)
        .priority(10)
        .build();

    // Higher priority Deny for production cluster
    let deny_policy = Policy::builder("pol_deny_prod", Effect::Deny)
        .name("Deny Prod Overwrites")
        .role("developer")
        .resource_kind("application")
        .action(Action::Write)
        .condition(Condition::ResourceAttributeEquals {
            key: "environment".to_string(),
            value: "production".to_string(),
        })
        .priority(100) // Evaluated first
        .build();

    let engine = AuthzEngine::builder()
        .with_policy(allow_policy)
        .with_policy(deny_policy)
        .build();

    let subject = Subject::new("user_1", "tenant_a").with_role("developer");

    // Staging resource -> Allowed
    let staging_resource = Resource::new("application", "app_stage", "tenant_a")
        .with_attribute("environment", "staging");
    let stage_ctx = EvaluationContext::new(subject.clone(), staging_resource, Action::Write);
    assert!(engine.evaluate(&stage_ctx).is_allowed());

    // Prod resource -> Denied
    let prod_resource = Resource::new("application", "app_prod", "tenant_a")
        .with_attribute("environment", "production");
    let prod_ctx = EvaluationContext::new(subject, prod_resource, Action::Write);
    let decision = engine.evaluate(&prod_ctx);
    assert!(!decision.is_allowed());
    assert!(decision.reason().contains("Deny Prod Overwrites"));
}

#[test]
fn test_role_inheritance_hierarchy() {
    // Admin inherits Editor, Editor inherits Viewer
    let viewer_policy = Policy::builder("pol_viewer", Effect::Allow)
        .name("Viewer Can Read")
        .role("viewer")
        .resource_kind("application")
        .action(Action::Read)
        .build();

    let engine = AuthzEngine::builder()
        .with_role_inheritance("admin", "editor")
        .with_role_inheritance("editor", "viewer")
        .with_policy(viewer_policy)
        .build();

    // Subject only has "admin" directly
    let subject = Subject::new("admin_user", "tenant_a").with_role("admin");
    let resource = Resource::new("application", "app_1", "tenant_a");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    let decision = engine.evaluate(&ctx);
    assert!(decision.is_allowed(), "Admin should inherit viewer rights");
}

#[test]
fn test_resource_ownership_condition() {
    let owner_policy = Policy::builder("pol_owner_delete", Effect::Allow)
        .name("Owner Can Delete")
        .any_role()
        .resource_kind("application")
        .action(Action::Delete)
        .resource_owner()
        .build();

    let engine = AuthzEngine::builder().with_policy(owner_policy).build();

    let alice = Subject::new("user_alice", "tenant_a");
    let bob = Subject::new("user_bob", "tenant_a");

    let alice_app = Resource::new("application", "app_1", "tenant_a").with_owner("user_alice");

    // Alice deletes her own app -> Allowed
    let alice_ctx = EvaluationContext::new(alice, alice_app.clone(), Action::Delete);
    assert!(engine.evaluate(&alice_ctx).is_allowed());

    // Bob tries to delete Alice's app -> Denied
    let bob_ctx = EvaluationContext::new(bob, alice_app, Action::Delete);
    assert!(!engine.evaluate(&bob_ctx).is_allowed());
}

#[test]
fn test_evaluation_cache_and_invalidation() {
    let policy = Policy::builder("pol_read", Effect::Allow)
        .name("Allow Read")
        .any_role()
        .resource_kind("application")
        .action(Action::Read)
        .build();

    let engine = AuthzEngine::builder()
        .with_policy(policy)
        .with_cache_ttl(Duration::from_secs(60))
        .build();

    let subject = Subject::new("user_1", "tenant_a");
    let resource = Resource::new("application", "app_1", "tenant_a");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    assert_eq!(engine.cache().len(), 0);

    // First evaluation fills cache
    let d1 = engine.evaluate(&ctx);
    assert!(d1.is_allowed());
    assert_eq!(engine.cache().len(), 1);

    // Second evaluation hits cache
    let d2 = engine.evaluate(&ctx);
    assert_eq!(d1, d2);

    // Invalidate subject
    engine.invalidate_subject("user_1");
    assert_eq!(engine.cache().len(), 0);
}

#[test]
fn test_audit_sink_records_evaluations() {
    let audit_sink = Arc::new(InMemoryAuditSink::new(100));

    let policy = Policy::builder("pol_audit_test", Effect::Allow)
        .name("Audit Test Policy")
        .any_role()
        .resource_kind("application")
        .action(Action::Read)
        .build();

    let engine = AuthzEngine::builder()
        .with_policy(policy)
        .with_audit_sink(audit_sink.clone())
        .build();

    let subject = Subject::new("audited_user", "tenant_audit");
    let resource = Resource::new("application", "app_99", "tenant_audit");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    engine.evaluate(&ctx);

    assert_eq!(audit_sink.count(), 1);
    let record = &audit_sink.all()[0];
    assert_eq!(record.subject_id, "audited_user");
    assert_eq!(record.tenant_id, "tenant_audit");
    assert_eq!(record.action, Action::Read);
    assert!(record.decision.is_allowed());
}

#[test]
fn test_actix_authorize_evaluation() {
    use actix_web::ResponseError;
    use aether_authz::authorize_actix;

    let policy = Policy::builder("actix_allow", Effect::Allow)
        .name("Actix Allow Read")
        .role("operator")
        .resource_kind("telemetry")
        .action(Action::Read)
        .same_tenant()
        .build();

    let engine = AuthzEngine::builder().with_policy(policy).build();

    let valid_subject = Subject::new("op_1", "tenant_prod").with_role("operator");
    let resource = Resource::new("telemetry", "metrics_1", "tenant_prod");
    let valid_ctx = EvaluationContext::new(valid_subject, resource.clone(), Action::Read);

    assert!(authorize_actix(&engine, &valid_ctx).is_ok());

    let invalid_subject = Subject::new("guest", "tenant_prod");
    let invalid_ctx = EvaluationContext::new(invalid_subject, resource, Action::Read);

    let err = authorize_actix(&engine, &invalid_ctx).unwrap_err();
    assert_eq!(err.status_code(), actix_web::http::StatusCode::FORBIDDEN);
}
