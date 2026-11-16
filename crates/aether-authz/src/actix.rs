use crate::{
    engine::AuthzEngine,
    model::{Action, Decision, EvaluationContext, Resource, Subject},
};
use actix_web::{
    body::{BoxBody, EitherBody},
    dev::{forward_ready, Payload, Service, ServiceRequest, ServiceResponse, Transform},
    http::StatusCode,
    Error, FromRequest, HttpRequest, HttpResponse, ResponseError,
};
use futures_util::future::{ready, LocalBoxFuture, Ready};
use serde::Serialize;
use std::{fmt, sync::Arc};

#[derive(Debug, Clone, Serialize)]
pub struct ActixAuthzErrorResponse {
    pub error: String,
    pub reason: String,
    pub status: u16,
}

#[derive(Debug)]
pub enum ActixAuthzError {
    Forbidden(String),
    Unauthorized(String),
}

impl fmt::Display for ActixAuthzError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ActixAuthzError::Forbidden(r) => write!(f, "Forbidden: {}", r),
            ActixAuthzError::Unauthorized(r) => write!(f, "Unauthorized: {}", r),
        }
    }
}

impl ResponseError for ActixAuthzError {
    fn status_code(&self) -> StatusCode {
        match self {
            ActixAuthzError::Forbidden(_) => StatusCode::FORBIDDEN,
            ActixAuthzError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        let reason = match self {
            ActixAuthzError::Forbidden(r) => r.clone(),
            ActixAuthzError::Unauthorized(r) => r.clone(),
        };

        HttpResponse::build(status).json(ActixAuthzErrorResponse {
            error: if status == StatusCode::FORBIDDEN {
                "Forbidden".to_string()
            } else {
                "Unauthorized".to_string()
            },
            reason,
            status: status.as_u16(),
        })
    }
}

/// Evaluates an authorization context against the engine within an Actix-web request.
pub fn authorize_actix(
    engine: &AuthzEngine,
    ctx: &EvaluationContext,
) -> Result<(), ActixAuthzError> {
    match engine.evaluate(ctx) {
        Decision::Allow { .. } => Ok(()),
        Decision::Deny { reason, .. } => Err(ActixAuthzError::Forbidden(reason)),
    }
}

/// Extractor that resolves the authenticated subject from HTTP request headers.
#[derive(Debug, Clone)]
pub struct AuthenticatedSubject {
    pub subject: Subject,
}

impl FromRequest for AuthenticatedSubject {
    type Error = ActixAuthzError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let user_id = req
            .headers()
            .get("x-user-id")
            .or_else(|| req.headers().get("x-subject-id"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or("anonymous");

        let tenant_id = req
            .headers()
            .get("x-tenant-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("default");

        let role = req
            .headers()
            .get("x-role")
            .or_else(|| req.headers().get("x-actor-role"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or("developer");

        let subject = Subject::new(user_id, tenant_id).with_role(role);
        ready(Ok(AuthenticatedSubject { subject }))
    }
}

/// Actix-web middleware Transform for enforcing authorization across routes.
#[derive(Clone)]
pub struct AuthzMiddleware {
    engine: Arc<AuthzEngine>,
}

impl AuthzMiddleware {
    pub fn new(engine: Arc<AuthzEngine>) -> Self {
        Self { engine }
    }
}

impl<S, B> Transform<S, ServiceRequest> for AuthzMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B, BoxBody>>;
    type Error = Error;
    type InitError = ();
    type Transform = AuthzMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthzMiddlewareService {
            service,
            engine: self.engine.clone(),
        }))
    }
}

pub struct AuthzMiddlewareService<S> {
    service: S,
    engine: Arc<AuthzEngine>,
}

impl<S, B> Service<ServiceRequest> for AuthzMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B, BoxBody>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let user_id = req
            .headers()
            .get("x-user-id")
            .or_else(|| req.headers().get("x-subject-id"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or("anonymous");

        let subject_tenant = req
            .headers()
            .get("x-tenant-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("default");

        let role = req
            .headers()
            .get("x-role")
            .or_else(|| req.headers().get("x-actor-role"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or("developer");

        let target_tenant = req
            .headers()
            .get("x-app-tenant-id")
            .or_else(|| req.headers().get("x-target-tenant"))
            .and_then(|v| v.to_str().ok())
            .unwrap_or(subject_tenant);

        let path = req.path().to_string();
        let method = req.method().as_str();

        let subject = Subject::new(user_id, subject_tenant).with_role(role);
        let resource = Resource::new("endpoint", &path, target_tenant);
        let action = Action::from(method);
        let ctx = EvaluationContext::new(subject, resource, action);

        let decision = self.engine.evaluate(&ctx);

        if let Decision::Deny { reason, .. } = decision {
            let error_body = serde_json::to_string(&ActixAuthzErrorResponse {
                error: "Forbidden".to_string(),
                reason,
                status: StatusCode::FORBIDDEN.as_u16(),
            })
            .unwrap_or_else(|_| "{\"error\":\"Forbidden\"}".to_string());

            let response = HttpResponse::Forbidden()
                .content_type("application/json")
                .body(error_body);

            let res = req.into_response(response).map_into_right_body();
            return Box::pin(async { Ok(res) });
        }

        let fut = self.service.call(req);
        Box::pin(async move {
            let res = fut.await?;
            Ok(res.map_into_left_body())
        })
    }
}
