use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicI64, AtomicU64, Ordering},
        Arc, RwLock,
    },
    time::Duration,
};

/// Standard Prometheus latency histogram buckets for web services (in seconds).
pub const DEFAULT_LATENCY_BUCKETS: &[f64] = &[
    0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

#[derive(Debug, Default)]
struct HistogramData {
    bucket_counts: Vec<AtomicU64>,
    sum: AtomicU64,   // Microseconds sum
    count: AtomicU64, // Total observation count
}

impl HistogramData {
    fn new(bucket_count: usize) -> Self {
        let mut buckets = Vec::with_capacity(bucket_count);
        for _ in 0..bucket_count {
            buckets.push(AtomicU64::new(0));
        }
        Self {
            bucket_counts: buckets,
            sum: AtomicU64::new(0),
            count: AtomicU64::new(0),
        }
    }

    fn observe(&self, duration_secs: f64, thresholds: &[f64]) {
        let micros = (duration_secs * 1_000_000.0) as u64;
        self.sum.fetch_add(micros, Ordering::Relaxed);
        self.count.fetch_add(1, Ordering::Relaxed);

        for (i, threshold) in thresholds.iter().enumerate() {
            if duration_secs <= *threshold {
                if let Some(bucket) = self.bucket_counts.get(i) {
                    bucket.fetch_add(1, Ordering::Relaxed);
                }
            }
        }
    }
}

/// RED Metrics Registry (Rate, Errors, Duration) for service observability.
#[derive(Clone, Default)]
pub struct MetricsRegistry {
    service_name: Arc<String>,
    // key: "method,route,status" -> request count
    request_counters: Arc<RwLock<HashMap<String, AtomicU64>>>,
    // in-flight requests gauge
    in_flight_requests: Arc<AtomicI64>,
    // key: "method,route" -> histogram data
    latency_histograms: Arc<RwLock<HashMap<String, Arc<HistogramData>>>>,
}

impl MetricsRegistry {
    pub fn new(service_name: impl Into<String>) -> Self {
        Self {
            service_name: Arc::new(service_name.into()),
            request_counters: Arc::new(RwLock::new(HashMap::new())),
            in_flight_requests: Arc::new(AtomicI64::new(0)),
            latency_histograms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn inc_in_flight(&self) {
        self.in_flight_requests.fetch_add(1, Ordering::Relaxed);
    }

    pub fn dec_in_flight(&self) {
        self.in_flight_requests.fetch_sub(1, Ordering::Relaxed);
    }

    pub fn in_flight(&self) -> i64 {
        self.in_flight_requests.load(Ordering::Relaxed)
    }

    pub fn record_request(&self, method: &str, route: &str, status: u16, duration: Duration) {
        let count_key = format!("{},{},{}", method, route, status);

        // Record request count
        {
            let map = self.request_counters.read().unwrap();
            if let Some(counter) = map.get(&count_key) {
                counter.fetch_add(1, Ordering::Relaxed);
            } else {
                drop(map);
                let mut map = self.request_counters.write().unwrap();
                let counter = map.entry(count_key).or_insert_with(|| AtomicU64::new(0));
                counter.fetch_add(1, Ordering::Relaxed);
            }
        }

        // Record latency histogram
        let hist_key = format!("{},{}", method, route);
        let duration_secs = duration.as_secs_f64();
        let hist = {
            let map = self.latency_histograms.read().unwrap();
            if let Some(h) = map.get(&hist_key) {
                h.clone()
            } else {
                drop(map);
                let mut map = self.latency_histograms.write().unwrap();
                map.entry(hist_key)
                    .or_insert_with(|| Arc::new(HistogramData::new(DEFAULT_LATENCY_BUCKETS.len())))
                    .clone()
            }
        };

        hist.observe(duration_secs, DEFAULT_LATENCY_BUCKETS);
    }

    /// Renders all metrics in Prometheus text exposition format.
    pub fn render_prometheus(&self) -> String {
        let mut out = String::new();

        // 1. In-flight requests gauge
        out.push_str(
            "# HELP http_requests_in_flight Number of HTTP requests currently executing\n",
        );
        out.push_str("# TYPE http_requests_in_flight gauge\n");
        out.push_str(&format!(
            "http_requests_in_flight{{service=\"{}\"}} {}\n",
            self.service_name,
            self.in_flight()
        ));

        // 2. Total requests counter
        out.push_str("# HELP http_requests_total Total number of HTTP requests processed\n");
        out.push_str("# TYPE http_requests_total counter\n");
        {
            let map = self.request_counters.read().unwrap();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();

            for key in keys {
                let parts: Vec<&str> = key.split(',').collect();
                if parts.len() == 3 {
                    let (method, route, status) = (parts[0], parts[1], parts[2]);
                    let count = map.get(key).unwrap().load(Ordering::Relaxed);
                    out.push_str(&format!(
                        "http_requests_total{{service=\"{}\",method=\"{}\",route=\"{}\",status=\"{}\"}} {}\n",
                        self.service_name, method, route, status, count
                    ));
                }
            }
        }

        // 3. Request duration histogram
        out.push_str("# HELP http_request_duration_seconds HTTP request latency in seconds\n");
        out.push_str("# TYPE http_request_duration_seconds histogram\n");
        {
            let map = self.latency_histograms.read().unwrap();
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();

            for key in keys {
                let parts: Vec<&str> = key.split(',').collect();
                if parts.len() == 2 {
                    let (method, route) = (parts[0], parts[1]);
                    let hist = map.get(key).unwrap();

                    let mut cumulative = 0u64;
                    for (i, threshold) in DEFAULT_LATENCY_BUCKETS.iter().enumerate() {
                        let count = hist.bucket_counts[i].load(Ordering::Relaxed);
                        cumulative += count;
                        out.push_str(&format!(
                            "http_request_duration_seconds_bucket{{service=\"{}\",method=\"{}\",route=\"{}\",le=\"{}\"}} {}\n",
                            self.service_name, method, route, threshold, cumulative
                        ));
                    }
                    let total = hist.count.load(Ordering::Relaxed);
                    out.push_str(&format!(
                        "http_request_duration_seconds_bucket{{service=\"{}\",method=\"{}\",route=\"{}\",le=\"+Inf\"}} {}\n",
                        self.service_name, method, route, total
                    ));
                    let sum_micros = hist.sum.load(Ordering::Relaxed);
                    let sum_secs = sum_micros as f64 / 1_000_000.0;
                    out.push_str(&format!(
                        "http_request_duration_seconds_sum{{service=\"{}\",method=\"{}\",route=\"{}\"}} {:.6}\n",
                        self.service_name, method, route, sum_secs
                    ));
                    out.push_str(&format!(
                        "http_request_duration_seconds_count{{service=\"{}\",method=\"{}\",route=\"{}\"}} {}\n",
                        self.service_name, method, route, total
                    ));
                }
            }
        }

        out
    }
}
