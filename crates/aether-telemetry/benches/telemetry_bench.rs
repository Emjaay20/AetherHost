use aether_telemetry::MetricsRegistry;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::{
    sync::Arc,
    thread,
    time::Duration,
};

fn bench_metric_recording(c: &mut Criterion) {
    let registry = MetricsRegistry::new("bench-service");

    let mut group = c.benchmark_group("telemetry_metrics_single_thread");

    group.bench_function("record_request_single_thread", |b| {
        b.iter(|| {
            registry.record_request(
                black_box("GET"),
                black_box("/api/v1/workloads"),
                black_box(200),
                black_box(Duration::from_micros(150)),
            );
        })
    });

    group.bench_function("in_flight_gauge_inc_dec", |b| {
        b.iter(|| {
            registry.inc_in_flight();
            registry.dec_in_flight();
        })
    });

    group.bench_function("render_prometheus", |b| {
        b.iter(|| {
            let output = registry.render_prometheus();
            black_box(output);
        })
    });

    group.finish();
}

fn bench_metric_recording_under_contention(c: &mut Criterion) {
    let mut group = c.benchmark_group("telemetry_metrics_contention");

    group.bench_function("concurrent_record_request_4_threads", |b| {
        b.iter_custom(|iters| {
            let registry = Arc::new(MetricsRegistry::new("bench-contention"));
            let per_thread_iters = (iters / 4).max(1);

            let start = std::time::Instant::now();
            let mut handles = Vec::with_capacity(4);

            for t in 0..4 {
                let reg = Arc::clone(&registry);
                let handle = thread::spawn(move || {
                    let path = format!("/api/v1/apps/{}", t % 3);
                    for i in 0..per_thread_iters {
                        let status = if i % 10 == 0 { 500 } else { 200 };
                        reg.record_request(
                            "POST",
                            &path,
                            status,
                            Duration::from_micros(200),
                        );
                    }
                });
                handles.push(handle);
            }

            for h in handles {
                h.join().unwrap();
            }

            start.elapsed()
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_metric_recording,
    bench_metric_recording_under_contention
);
criterion_main!(benches);
