use crate::{
    engine::AuthzEngine,
    model::{Decision, EvaluationContext},
};
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AuthzErrorResponse {
    pub error: String,
    pub reason: String,
    pub status: u16,
}

#[derive(Debug, Clone)]
pub enum AuthzError {
    Forbidden(String),
    Unauthorized(String),
    Internal(String),
}

impl IntoResponse for AuthzError {
    fn into_response(self) -> Response {
        let (status, reason) = match self {
            AuthzError::Forbidden(r) => (StatusCode::FORBIDDEN, r),
            AuthzError::Unauthorized(r) => (StatusCode::UNAUTHORIZED, r),
            AuthzError::Internal(r) => (StatusCode::INTERNAL_SERVER_ERROR, r),
        };

        let body = Json(AuthzErrorResponse {
            error: match status {
                StatusCode::FORBIDDEN => "Forbidden".to_string(),
                StatusCode::UNAUTHORIZED => "Unauthorized".to_string(),
                _ => "Internal Authorization Error".to_string(),
            },
            reason,
            status: status.as_u16(),
        });

        (status, body).into_response()
    }
}

/// Helper function to evaluate an authorization context against an engine, returning Result<(), AuthzError>.
pub fn authorize(engine: &AuthzEngine, ctx: &EvaluationContext) -> Result<(), AuthzError> {
    match engine.evaluate(ctx) {
        Decision::Allow { .. } => Ok(()),
        Decision::Deny { reason, .. } => Err(AuthzError::Forbidden(reason)),
    }
}
