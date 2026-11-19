use aether_authz::{
    Action, AuthzEngine, Effect, EvaluationCache, EvaluationContext, Policy, Resource, Subject,
};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::time::Duration;

fn build_bench_engine() -> AuthzEngine {
    AuthzEngine::builder()
        .with_role_inheritance("admin", "developer")
        .with_role_inheritance("developer", "viewer")
        .with_policy(
            Policy::builder("tenant_boundary", Effect::Allow)
                .name("Tenant Boundary Isolation")
                .role("developer")
                .any_resource()
                .any_action()
                .same_tenant()
                .build(),
        )
        .with_policy(
            Policy::builder("public_viewer", Effect::Allow)
                .name("Viewer Read-Only")
                .role("viewer")
                .resource_kind("application")
                .action(Action::Read)
                .build(),
        )
        .with_policy(
            Policy::builder("admin_override", Effect::Allow)
                .name("Admin Full Platform Access")
                .role("admin")
                .any_resource()
                .any_action()
                .build(),
        )
        .build()
}

fn bench_policy_evaluations(c: &mut Criterion) {
    let engine = build_bench_engine();

    let subject = Subject::new("usr_bench_1", "tenant-prime").with_role("developer");
    let resource = Resource::new("application", "app-prod-100", "tenant-prime");
    let ctx = EvaluationContext::new(subject, resource, Action::Read);

    // Warm up the evaluation cache
    let _ = engine.evaluate(&ctx);

    let mut group = c.benchmark_group("authz_policy_evaluation");

    // 1. Cached evaluation
    group.bench_function("cached_evaluation", |b| {
        b.iter(|| {
            let res = engine.evaluate(black_box(&ctx));
            black_box(res);
        })
    });

    // 2. Uncached evaluation (unique resource ID on each iteration forces policy evaluation)
    let uncached_engine = build_bench_engine();
    let mut counter: u64 = 0;
    group.bench_function("uncached_evaluation", |b| {
        b.iter(|| {
            counter += 1;
            let sub =
                Subject::new(format!("usr_{}", counter), "tenant-prime").with_role("developer");
            let res = Resource::new("application", format!("app_{}", counter), "tenant-prime");
            let uncached_ctx = EvaluationContext::new(sub, res, Action::Read);
            let decision = uncached_engine.evaluate(black_box(&uncached_ctx));
            black_box(decision);
        })
    });

    group.finish();
}

fn bench_cache_invalidation(c: &mut Criterion) {
    let cache = EvaluationCache::new(Duration::from_secs(300), 10_000);

    // Prepopulate cache with entries across multiple tenants
    for t in 0..50 {
        let tenant_id = format!("tenant_{}", t);
        for r in 0..20 {
            let sub = Subject::new(format!("sub_{}_{}", t, r), &tenant_id);
            let res = Resource::new("application", format!("res_{}_{}", t, r), &tenant_id);
            let ctx = EvaluationContext::new(sub, res, Action::Read);
            cache.insert(
                &ctx,
                aether_authz::Decision::Allow {
                    matched_policy_id: Some("bench".to_string()),
                    reason: "benchmark".to_string(),
                },
            );
        }
    }

    let mut group = c.benchmark_group("authz_cache_invalidation");

    group.bench_function("invalidate_tenant", |b| {
        b.iter(|| {
            cache.invalidate_tenant(black_box("tenant_25"));
        })
    });

    group.bench_function("invalidate_subject", |b| {
        b.iter(|| {
            cache.invalidate_subject(black_box("sub_10_5"));
        })
    });

    group.bench_function("invalidate_resource", |b| {
        b.iter(|| {
            cache.invalidate_resource(black_box("res_10_5"));
        })
    });

    group.finish();
}

criterion_group!(benches, bench_policy_evaluations, bench_cache_invalidation);
criterion_main!(benches);
