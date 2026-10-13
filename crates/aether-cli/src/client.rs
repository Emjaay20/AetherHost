use crate::config::CliConfig;
pub use aether_core::{AiIterationResult, Application, DeploymentLog};
use aether_core::build_http_client;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};

pub struct AetherClient {
    http: reqwest::Client,
    config: CliConfig,
}

impl AetherClient {
    pub fn new(config: CliConfig) -> Self {
        Self {
            http: build_http_client(30),
            config,
        }
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        if let Some(token) = &self.config.token {
            let auth_val = format!("Bearer {}", token);
            if let Ok(val) = HeaderValue::from_str(&auth_val) {
                headers.insert(AUTHORIZATION, val);
            }
        }

        if let Some(agent_key) = &self.config.agent_key {
            if let Ok(val) = HeaderValue::from_str(agent_key) {
                headers.insert("x-agent-key", val);
            }
        }

        headers
    }

    pub async fn check_health(&self) -> Result<bool, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/health", self.config.api_url);
        let resp = self.http.get(&url).headers(self.headers()).send().await?;
        Ok(resp.status().is_success())
    }

    pub async fn list_applications(&self) -> Result<Vec<Application>, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/applications", self.config.api_url);
        let resp = self.http.get(&url).headers(self.headers()).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("API error ({}): {}", status, err_body).into());
        }

        let apps: Vec<Application> = resp.json().await?;
        Ok(apps)
    }

    pub async fn get_logs(&self, app_id: &str) -> Result<Vec<DeploymentLog>, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/applications/{}/logs", self.config.api_url, app_id);
        let resp = self.http.get(&url).headers(self.headers()).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Failed to fetch logs ({}): {}", status, err_body).into());
        }

        let logs: Vec<DeploymentLog> = resp.json().await?;
        Ok(logs)
    }

    pub async fn create_application(
        &self,
        name: &str,
        runtime: &str,
    ) -> Result<Application, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/applications", self.config.api_url);
        let body = serde_json::json!({
            "name": name,
            "runtime": runtime,
        });

        let resp = self
            .http
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("Failed to create application ({}): {}", status, err_body).into());
        }

        let app: Application = resp.json().await?;
        Ok(app)
    }

    pub async fn iterate_with_ai(
        &self,
        app_id: &str,
        prompt: &str,
    ) -> Result<AiIterationResult, Box<dyn std::error::Error>> {
        let url = format!("{}/v1/ai/applications/{}/iterate", self.config.api_url, app_id);
        let body = serde_json::json!({
            "prompt": prompt,
        });

        let resp = self
            .http
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_body = resp.text().await.unwrap_or_default();
            return Err(format!("AI iteration failed ({}): {}", status, err_body).into());
        }

        let result: AiIterationResult = resp.json().await?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_headers_with_token_and_agent_key() {
        let cfg = CliConfig {
            api_url: "http://localhost:3000".to_string(),
            token: Some("jwt_123".to_string()),
            agent_key: Some("agent_secret".to_string()),
        };
        let client = AetherClient::new(cfg);
        let headers = client.headers();

        assert_eq!(
            headers.get(AUTHORIZATION).and_then(|v| v.to_str().ok()),
            Some("Bearer jwt_123")
        );
        assert_eq!(
            headers.get("x-agent-key").and_then(|v| v.to_str().ok()),
            Some("agent_secret")
        );
    }
}
