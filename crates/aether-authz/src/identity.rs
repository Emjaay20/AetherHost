//! Server-owned service identities and resource ownership. Never trust identity headers.
//! This private-service adapter is not an end-user OAuth/JWT issuer.
use crate::Subject;
use aether_core::constant_time_eq;
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use std::{
    collections::HashMap,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityRegistry {
    credentials: Vec<ServiceCredential>,
    resources: HashMap<String, String>,
}

#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ServiceCredential {
    token: String,
    subject_id: String,
    tenant_id: String,
    role: String,
    expires_at: u64,
}

impl IdentityRegistry {
    pub fn from_json(json: &str) -> Result<Self, &'static str> {
        let registry: Self =
            serde_json::from_str(json).map_err(|_| "Invalid service identity configuration")?;
        for credential in &registry.credentials {
            if credential.token.len() < 32
                || credential.subject_id.is_empty()
                || credential.tenant_id.is_empty()
                || !matches!(credential.role.as_str(), "developer" | "viewer" | "admin")
                || credential.expires_at == 0
            {
                return Err("Service identities require strong tokens, identity, role and expiry");
            }
        }
        for (i, credential) in registry.credentials.iter().enumerate() {
            if registry.credentials[..i]
                .iter()
                .any(|other| constant_time_eq(&other.token, &credential.token))
            {
                return Err("Duplicate service credential");
            }
        }
        if registry
            .resources
            .iter()
            .any(|(id, tenant)| id.is_empty() || tenant.is_empty())
        {
            return Err("Resources require explicit tenant ownership");
        }
        Ok(registry)
    }

    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let path = std::env::var("AETHER_IDENTITY_CONFIG_FILE")?;
        let metadata = std::fs::metadata(&path)?;
        if !metadata.is_file() || metadata.len() > 1_048_576 {
            return Err("Identity registry must be a regular file smaller than 1 MiB".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if metadata.permissions().mode() & 0o027 != 0 {
                return Err(
                    "Identity registry must not be group-writable or accessible to others".into(),
                );
            }
        }
        Self::from_json(&std::fs::read_to_string(path)?).map_err(Into::into)
    }

    fn credential(&self, headers: &HeaderMap) -> Result<&ServiceCredential, StatusCode> {
        let token = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(StatusCode::UNAUTHORIZED)?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| StatusCode::UNAUTHORIZED)?
            .as_secs();
        self.credentials
            .iter()
            .find(|c| constant_time_eq(token, &c.token) && c.expires_at > now)
            .ok_or(StatusCode::UNAUTHORIZED)
    }

    pub fn authenticate(&self, headers: &HeaderMap) -> Result<Subject, StatusCode> {
        let credential = self.credential(headers)?;
        Ok(Subject::new(&credential.subject_id, &credential.tenant_id).with_role(&credential.role))
    }

    /// Long-lived streams must reauthenticate at credential expiry or after 15 minutes.
    pub fn session_duration(&self, headers: &HeaderMap) -> Result<std::time::Duration, StatusCode> {
        let expires_at = self.credential(headers)?.expires_at;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| StatusCode::UNAUTHORIZED)?
            .as_secs();
        Ok(std::time::Duration::from_secs(
            expires_at.saturating_sub(now).min(900),
        ))
    }

    pub fn resolve(
        &self,
        headers: &HeaderMap,
        resource_id: &str,
    ) -> Result<(Subject, String), StatusCode> {
        let subject = self.authenticate(headers)?;
        let tenant = self
            .resources
            .get(resource_id)
            .ok_or(StatusCode::NOT_FOUND)?;
        Ok((subject, tenant.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_missing_identity_and_expired_credentials() {
        let registry = IdentityRegistry::from_json(r#"{"credentials":[{"token":"01234567890123456789012345678901","subject_id":"svc","tenant_id":"alpha","role":"developer","expires_at":1}],"resources":{"app":"beta"}}"#).unwrap();
        let mut headers = HeaderMap::new();
        headers.insert("x-role", "admin".parse().unwrap());
        headers.insert("x-tenant-id", "beta".parse().unwrap());
        assert!(registry.resolve(&headers, "app").is_err());
        headers.insert(
            "authorization",
            "Bearer 01234567890123456789012345678901".parse().unwrap(),
        );
        assert!(registry.resolve(&headers, "app").is_err());
    }
    #[test]
    fn ownership_and_identity_ignore_forged_headers() {
        let registry = IdentityRegistry::from_json(r#"{"credentials":[{"token":"01234567890123456789012345678901","subject_id":"svc","tenant_id":"alpha","role":"developer","expires_at":4102444800}],"resources":{"app":"beta"}}"#).unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            "Bearer 01234567890123456789012345678901".parse().unwrap(),
        );
        headers.insert("x-app-tenant-id", "alpha".parse().unwrap());
        let (_, owner) = registry.resolve(&headers, "app").unwrap();
        assert_eq!(owner, "beta");
        assert!(registry.resolve(&headers, "unknown").is_err());
    }
}
