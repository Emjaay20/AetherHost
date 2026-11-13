use crate::{
    engine::AuthzEngine,
    model::{Decision, EvaluationContext},
};
use actix_web::{
    http::StatusCode,
    HttpResponse, ResponseError,
};
use serde::Serialize;
use std::fmt;

#[derive(Debug, Serialize)]
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
