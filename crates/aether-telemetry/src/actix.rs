use crate::{metrics::MetricsRegistry, tracing::W3cTraceContext};
use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    http::header,
    Error, HttpResponse, Responder,
};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use std::{sync::Arc, time::Instant};

/// Helper to record completed Actix-web request telemetry into the metrics registry.
pub fn record_actix_request(
    registry: &MetricsRegistry,
    method: &str,
    path: &str,
    status: u16,
    duration: std::time::Duration,
) {
    registry.record_request(method, path, status, duration);
}

/// Standard Actix-web handler for Prometheus exposition endpoint `/_aether/metrics` or `/metrics`.
pub async fn actix_prometheus_metrics(
    registry: actix_web::web::Data<MetricsRegistry>,
) -> impl Responder {
    let body = registry.render_prometheus();
    HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, "text/plain; version=0.0.4"))
        .body(body)
}

/// Actix-web middleware Transform for RED metrics and W3C traceparent observability.
#[derive(Clone)]
pub struct ActixTelemetryMiddleware {
    registry: Arc<MetricsRegistry>,
}

impl ActixTelemetryMiddleware {
    pub fn new(registry: Arc<MetricsRegistry>) -> Self {
        Self { registry }
    }
}

impl<S, B> Transform<S, ServiceRequest> for ActixTelemetryMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = ActixTelemetryMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(ActixTelemetryMiddlewareService {
            service,
            registry: self.registry.clone(),
        }))
    }
}

pub struct ActixTelemetryMiddlewareService<S> {
    service: S,
    registry: Arc<MetricsRegistry>,
}

impl<S, B> Service<ServiceRequest> for ActixTelemetryMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let registry = self.registry.clone();
        registry.inc_in_flight();
        let start = Instant::now();

        let method = req.method().to_string();
        let path = req.path().to_string();

        // Parse incoming W3C traceparent if present
        let trace_ctx = req
            .headers()
            .get("traceparent")
            .and_then(|h| h.to_str().ok())
            .and_then(W3cTraceContext::parse_traceparent);

        let traceparent_header = trace_ctx.map(|tc| tc.to_traceparent_header());

        let fut = self.service.call(req);

        Box::pin(async move {
            let res = fut.await;
            registry.dec_in_flight();
            let duration = start.elapsed();

            match res {
                Ok(mut response) => {
                    let status = response.status().as_u16();
                    registry.record_request(&method, &path, status, duration);

                    if let Some(tp) = traceparent_header {
                        if let Ok(val) = header::HeaderValue::from_str(&tp) {
                            response.headers_mut().insert(
                                header::HeaderName::from_static("traceparent"),
                                val,
                            );
                        }
                    }

                    Ok(response)
                }
                Err(err) => {
                    registry.record_request(&method, &path, 500, duration);
                    Err(err)
                }
            }
        })
    }
}
