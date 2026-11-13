use aether_authz::{Action, AuthzEngine, Effect, EvaluationContext, Policy, Resource, Subject};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<Value>,
}

pub async fn run_mcp_server() -> Result<(), Box<dyn std::error::Error>> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let reader = stdin.lock();

    // Default policy engine instance for agent policy verification
    let engine = AuthzEngine::builder()
        .with_policy(
            Policy::builder("default_developer", Effect::Allow)
                .name("Developer CRUD on own apps")
                .role("developer")
                .resource_kind("application")
                .any_action()
                .same_tenant()
                .build(),
        )
        .with_policy(
            Policy::builder("admin_override", Effect::Allow)
                .name("Admin Full Access")
                .role("admin")
                .any_resource()
                .any_action()
                .build(),
        )
        .build();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }

        let req: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                let err_res = json!({
                    "jsonrpc": "2.0",
                    "id": null,
                    "error": { "code": -32700, "message": format!("Parse error: {}", e) }
                });
                writeln!(stdout, "{}", serde_json::to_string(&err_res)?)?;
                stdout.flush()?;
                continue;
            }
        };

        let response = handle_mcp_method(&req, &engine);
        writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
        stdout.flush()?;
    }

    Ok(())
}

fn handle_mcp_method(req: &JsonRpcRequest, engine: &AuthzEngine) -> JsonRpcResponse {
    match req.method.as_str() {
        "initialize" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id.clone(),
            result: Some(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "aether-mcp",
                    "version": "0.1.0"
                }
            })),
            error: None,
        },
        "ping" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id.clone(),
            result: Some(json!({})),
            error: None,
        },
        "tools/list" => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id.clone(),
            result: Some(json!({
                "tools": [
                    {
                        "name": "get_platform_info",
                        "description": "Returns supported runtimes, ports, and architectural conventions for AetherHost",
                        "inputSchema": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "name": "validate_manifest",
                        "description": "Validates application configuration manifests before deployment",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "name": { "type": "string" },
                                "runtime": { "type": "string", "enum": ["nodejs", "python", "rust", "go"] },
                                "port": { "type": "number" }
                            },
                            "required": ["name", "runtime"]
                        }
                    },
                    {
                        "name": "evaluate_policy",
                        "description": "Evaluates RBAC/ABAC authorization rules for an actor and target resource",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "subject_id": { "type": "string" },
                                "tenant_id": { "type": "string" },
                                "role": { "type": "string" },
                                "resource_kind": { "type": "string" },
                                "resource_id": { "type": "string" },
                                "resource_tenant": { "type": "string" },
                                "action": { "type": "string" }
                            },
                            "required": ["subject_id", "tenant_id", "role", "resource_kind", "resource_id", "resource_tenant", "action"]
                        }
                    }
                ]
            })),
            error: None,
        },
        "tools/call" => {
            let params = req.params.as_ref();
            let tool_name = params
                .and_then(|p| p.get("name"))
                .and_then(|n| n.as_str())
                .unwrap_or("");
            let args = params
                .and_then(|p| p.get("arguments"))
                .cloned()
                .unwrap_or(json!({}));

            let tool_result = match tool_name {
                "get_platform_info" => json!({
                    "platform": "AetherHost",
                    "supported_runtimes": ["nodejs", "python", "rust", "go"],
                    "default_port": 3000,
                    "authz_engine": "aether-authz v0.1.0",
                    "telemetry": "aether-telemetry (W3C + Prometheus)",
                    "edge_proxy": "aether-router on :8080"
                }),
                "validate_manifest" => {
                    let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let runtime = args.get("runtime").and_then(|v| v.as_str()).unwrap_or("");
                    let mut errors = Vec::new();

                    if name.is_empty() || name.len() > 63 {
                        errors.push("Application name must be between 1 and 63 characters");
                    }
                    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                        errors.push("Application name must contain only alphanumeric characters and hyphens");
                    }
                    if !["nodejs", "python", "rust", "go"].contains(&runtime) {
                        errors.push("Invalid runtime. Must be one of: nodejs, python, rust, go");
                    }

                    if errors.is_empty() {
                        json!({ "valid": true, "message": "Manifest is valid for deployment" })
                    } else {
                        json!({ "valid": false, "errors": errors })
                    }
                }
                "evaluate_policy" => {
                    let subject_id = args
                        .get("subject_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("anon");
                    let tenant_id = args
                        .get("tenant_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("tenant_default");
                    let role = args
                        .get("role")
                        .and_then(|v| v.as_str())
                        .unwrap_or("developer");
                    let kind = args
                        .get("resource_kind")
                        .and_then(|v| v.as_str())
                        .unwrap_or("application");
                    let res_id = args
                        .get("resource_id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("res_default");
                    let res_tenant = args
                        .get("resource_tenant")
                        .and_then(|v| v.as_str())
                        .unwrap_or(tenant_id);
                    let action = args
                        .get("action")
                        .and_then(|v| v.as_str())
                        .unwrap_or("read");

                    let subject = Subject::new(subject_id, tenant_id).with_role(role);
                    let resource = Resource::new(kind, res_id, res_tenant);
                    let ctx = EvaluationContext::new(subject, resource, Action::from(action));

                    let decision = engine.evaluate(&ctx);
                    json!({
                        "allowed": decision.is_allowed(),
                        "reason": decision.reason()
                    })
                }
                _ => json!({ "error": format!("Unknown tool: {}", tool_name) }),
            };

            JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id.clone(),
                result: Some(json!({
                    "content": [
                        {
                            "type": "text",
                            "text": serde_json::to_string_pretty(&tool_result).unwrap_or_default()
                        }
                    ]
                })),
                error: None,
            }
        }
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id.clone(),
            result: None,
            error: Some(json!({
                "code": -32601,
                "message": format!("Method not found: {}", req.method)
            })),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_initialize() {
        let engine = AuthzEngine::builder().build();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(1)),
            method: "initialize".to_string(),
            params: None,
        };
        let res = handle_mcp_method(&req, &engine);
        assert!(res.error.is_none());
        let result = res.result.unwrap();
        assert_eq!(result["serverInfo"]["name"], "aether-mcp");
    }

    #[test]
    fn test_mcp_tools_list() {
        let engine = AuthzEngine::builder().build();
        let req = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: Some(json!(2)),
            method: "tools/list".to_string(),
            params: None,
        };
        let res = handle_mcp_method(&req, &engine);
        assert!(res.error.is_none());
        let tools = res.result.unwrap()["tools"].as_array().unwrap().len();
        assert_eq!(tools, 3);
    }
}
