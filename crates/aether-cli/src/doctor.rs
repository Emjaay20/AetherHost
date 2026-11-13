use colored::*;
use comfy_table::{presets::UTF8_FULL, Cell, Color, Row, Table};
use std::process::Command;
use std::time::Instant;

pub struct DoctorCheck {
    pub name: &'static str,
    pub status: bool,
    pub latency_ms: u128,
    pub detail: String,
}

pub async fn run_doctor(api_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "\n{}",
        "🩺 Running AetherHost Platform Environment Doctor..."
            .cyan()
            .bold()
    );
    println!(
        "{}",
        "=========================================================".dimmed()
    );

    let mut checks = Vec::new();

    // 1. Rust toolchain check
    let start = Instant::now();
    let rust_check = Command::new("rustc").arg("--version").output();
    let elapsed = start.elapsed().as_millis();
    match rust_check {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            checks.push(DoctorCheck {
                name: "Rust Toolchain",
                status: true,
                latency_ms: elapsed,
                detail: version,
            });
        }
        _ => {
            checks.push(DoctorCheck {
                name: "Rust Toolchain",
                status: false,
                latency_ms: elapsed,
                detail: "rustc not found on PATH. Install via https://rustup.rs".to_string(),
            });
        }
    }

    // 2. Docker daemon check
    let start = Instant::now();
    let docker_check = Command::new("docker").arg("info").output();
    let elapsed = start.elapsed().as_millis();
    match docker_check {
        Ok(out) if out.status.success() => {
            checks.push(DoctorCheck {
                name: "Docker Engine Daemon",
                status: true,
                latency_ms: elapsed,
                detail: "Active & responsive (/var/run/docker.sock)".to_string(),
            });
        }
        _ => {
            checks.push(DoctorCheck {
                name: "Docker Engine Daemon",
                status: false,
                latency_ms: elapsed,
                detail: "Docker daemon not running or socket inaccessible".to_string(),
            });
        }
    }

    // 3. Git binary check
    let start = Instant::now();
    let git_check = Command::new("git").arg("--version").output();
    let elapsed = start.elapsed().as_millis();
    match git_check {
        Ok(out) if out.status.success() => {
            let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
            checks.push(DoctorCheck {
                name: "Git SCM",
                status: true,
                latency_ms: elapsed,
                detail: version,
            });
        }
        _ => {
            checks.push(DoctorCheck {
                name: "Git SCM",
                status: false,
                latency_ms: elapsed,
                detail: "git not found".to_string(),
            });
        }
    }

    // 4. API Control Plane Health check
    let start = Instant::now();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()?;
    let health_url = format!("{}/health", api_url.trim_end_matches('/'));
    let api_status = client.get(&health_url).send().await;
    let elapsed = start.elapsed().as_millis();
    match api_status {
        Ok(resp) if resp.status().is_success() => {
            checks.push(DoctorCheck {
                name: "API Control Plane",
                status: true,
                latency_ms: elapsed,
                detail: format!("Reachable at {}", api_url),
            });
        }
        Ok(resp) => {
            checks.push(DoctorCheck {
                name: "API Control Plane",
                status: false,
                latency_ms: elapsed,
                detail: format!("Returned HTTP {}", resp.status()),
            });
        }
        Err(e) => {
            checks.push(DoctorCheck {
                name: "API Control Plane",
                status: false,
                latency_ms: elapsed,
                detail: format!("Unreachable: {}", e),
            });
        }
    }

    // Display table
    let mut table = Table::new();
    table.load_preset(UTF8_FULL);
    table.set_header(vec![
        Cell::new("Component").fg(Color::Cyan),
        Cell::new("Status").fg(Color::Cyan),
        Cell::new("Latency").fg(Color::Cyan),
        Cell::new("Details").fg(Color::Cyan),
    ]);

    let mut all_healthy = true;
    for check in checks {
        if !check.status {
            all_healthy = false;
        }
        let status_cell = if check.status {
            Cell::new("✔ HEALTHY").fg(Color::Green)
        } else {
            Cell::new("✖ FAILED").fg(Color::Red)
        };

        table.add_row(Row::from(vec![
            Cell::new(check.name),
            status_cell,
            Cell::new(format!("{}ms", check.latency_ms)),
            Cell::new(check.detail),
        ]));
    }

    println!("{table}");

    if all_healthy {
        println!(
            "\n{}",
            "🎉 All platform environment components are healthy!"
                .green()
                .bold()
        );
    } else {
        println!(
            "\n{}",
            "⚠️  Some environment checks failed. Review the table above for remediation."
                .yellow()
                .bold()
        );
    }

    Ok(())
}
