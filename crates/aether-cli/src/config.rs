use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CliConfig {
    pub api_url: String,
    pub token: Option<String>,
    pub agent_key: Option<String>,
}

impl Default for CliConfig {
    fn default() -> Self {
        Self {
            api_url: std::env::var("AETHER_API_URL")
                .unwrap_or_else(|_| "http://localhost:3000".to_string()),
            token: std::env::var("AETHER_TOKEN").ok(),
            agent_key: std::env::var("AETHER_AGENT_KEY").ok(),
        }
    }
}

impl CliConfig {
    pub fn config_path() -> PathBuf {
        let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
        home.join(".aether").join("config.json")
    }

    pub fn load() -> Self {
        let path = Self::config_path();
        if path.exists() {
            if let Ok(data) = fs::read_to_string(&path) {
                if let Ok(mut config) = serde_json::from_str::<CliConfig>(&data) {
                    if let Ok(env_url) = std::env::var("AETHER_API_URL") {
                        config.api_url = env_url;
                    }
                    if let Ok(env_token) = std::env::var("AETHER_TOKEN") {
                        config.token = Some(env_token);
                    }
                    return config;
                }
            }
        }
        Self::default()
    }

    pub fn save(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(self)?;
        fs::write(path, data)?;
        Ok(())
    }
}
