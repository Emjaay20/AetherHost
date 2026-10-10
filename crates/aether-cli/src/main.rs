mod client;
mod config;

use clap::{Parser, Subcommand};
use colored::*;
use comfy_table::{presets::UTF8_FULL, Cell, Color, Row, Table};
use indicatif::{ProgressBar, ProgressStyle};
use std::time::Duration;

use client::AetherClient;
use config::CliConfig;

#[derive(Parser)]
#[command(name = "aether")]
#[command(author = "AetherHost Team")]
#[command(version = "0.1.0")]
#[command(about = "Official Developer CLI for AetherHost Cloud & AI Platform", long_about = None)]
struct Cli {
    #[arg(short, long, help = "Override API control plane URL")]
    api_url: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "Authenticate and set target AetherHost API")]
    Login {
        #[arg(short, long, help = "Authentication token or API key")]
        token: Option<String>,
        #[arg(short, long, help = "Control plane URL (default: http://localhost:3000)")]
        url: Option<String>,
    },

    #[command(about = "List all applications deployed on AetherHost", aliases = &["ls"])]
    List,

    #[command(about = "Create and deploy a new application")]
    Create {
        #[arg(help = "Application name (e.g. my-app)")]
        name: String,
        #[arg(
            short,
            long,
            default_value = "nodejs",
            help = "Runtime (nodejs, python, rust, go)"
        )]
        runtime: String,
    },

    #[command(about = "View build & runtime container logs for an application")]
    Logs {
        #[arg(help = "Application ID")]
        app_id: String,
    },

    #[command(about = "Prompt the AI Architect to synthesize code, commit, and deploy")]
    Ai {
        #[arg(help = "Application ID")]
        app_id: String,
        #[arg(help = "Change request prompt")]
        prompt: String,
    },

    #[command(about = "Check health and connectivity of the control plane")]
    Status,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let mut config = CliConfig::load();

    if let Some(url) = cli.api_url {
        config.api_url = url;
    }

    match cli.command {
        Commands::Login { token, url } => {
            if let Some(u) = url {
                config.api_url = u;
            }
            if let Some(t) = token {
                config.token = Some(t);
            } else if config.token.is_none() {
                println!("{}", "Enter authentication token:".cyan());
                let mut input = String::new();
                std::io::stdin().read_line(&mut input)?;
                let trimmed = input.trim();
                if !trimmed.is_empty() {
                    config.token = Some(trimmed.to_string());
                }
            }

            config.save()?;
            println!(
                "{} Credentials saved to {}",
                "✓ Success:".green().bold(),
                CliConfig::config_path().display().to_string().cyan()
            );
            println!("  Target API: {}", config.api_url.bold());
        }

        Commands::Status => {
            println!("{}", "Checking AetherHost Control Plane...".cyan());
            let client = AetherClient::new(config.clone());
            match client.check_health().await {
                Ok(true) => {
                    println!("{} Control Plane is online and healthy!", "✓ ONLINE:".green().bold());
                    println!("  URL: {}", config.api_url.bold());
                }
                Ok(false) => {
                    println!("{} Control Plane returned an unhealthy status.", "⚠ WARNING:".yellow().bold());
                }
                Err(e) => {
                    println!("{} Cannot reach Control Plane: {}", "✗ ERROR:".red().bold(), e);
                }
            }
        }

        Commands::List => {
            let pb = ProgressBar::new_spinner();
            pb.set_style(ProgressStyle::default_spinner().template("{spinner:.green} {msg}")?);
            pb.set_message("Fetching applications...");
            pb.enable_steady_tick(Duration::from_millis(80));

            let client = AetherClient::new(config.clone());
            match client.list_applications().await {
                Ok(apps) => {
                    pb.finish_and_clear();
                    if apps.is_empty() {
                        println!("{}", "No applications found. Create one with `aether create <name>`!".yellow());
                        return Ok(());
                    }

                    let mut table = Table::new();
                    table.load_preset(UTF8_FULL);
                    table.set_header(vec![
                        Cell::new("Name").fg(Color::Cyan),
                        Cell::new("Runtime").fg(Color::Yellow),
                        Cell::new("Status").fg(Color::Green),
                        Cell::new("ID").fg(Color::DarkGrey),
                        Cell::new("GitHub Repo").fg(Color::Magenta),
                    ]);

                    for app in apps {
                        let status_cell = if app.status == "running" {
                            Cell::new(&app.status).fg(Color::Green)
                        } else if app.status == "pending" {
                            Cell::new(&app.status).fg(Color::Yellow)
                        } else {
                            Cell::new(&app.status).fg(Color::Red)
                        };

                        table.add_row(Row::from(vec![
                            Cell::new(&app.name),
                            Cell::new(&app.runtime),
                            status_cell,
                            Cell::new(&app.id),
                            Cell::new(app.github_repo.unwrap_or_else(|| "-".to_string())),
                        ]));
                    }

                    println!("{}", table);
                }
                Err(e) => {
                    pb.finish_and_clear();
                    eprintln!("{} Failed to list applications: {}", "✗ ERROR:".red().bold(), e);
                }
            }
        }

        Commands::Create { name, runtime } => {
            println!(
                "{} Provisioning application '{}' (Runtime: {})...",
                "⚡ AetherHost:".blue().bold(),
                name.bold(),
                runtime.cyan()
            );

            let pb = ProgressBar::new_spinner();
            pb.set_style(ProgressStyle::default_spinner().template("{spinner:.blue} {msg}")?);
            pb.set_message("Talking to control plane...");
            pb.enable_steady_tick(Duration::from_millis(80));

            let client = AetherClient::new(config.clone());
            match client.create_application(&name, &runtime).await {
                Ok(app) => {
                    pb.finish_and_clear();
                    println!("{} Application created successfully!", "✓ SUCCESS:".green().bold());
                    println!("  ID:      {}", app.id.cyan());
                    println!("  Name:    {}", app.name.bold());
                    println!("  Runtime: {}", app.runtime.yellow());
                    println!("  Status:  {}", app.status.green());
                    println!("\nView live build logs with: {}", format!("aether logs {}", app.id).bold());
                }
                Err(e) => {
                    pb.finish_and_clear();
                    eprintln!("{} Creation failed: {}", "✗ ERROR:".red().bold(), e);
                }
            }
        }

        Commands::Logs { app_id } => {
            println!("{} Fetching logs for application {}...", "📜 Logs:".cyan().bold(), app_id.bold());
            let client = AetherClient::new(config.clone());
            match client.get_logs(&app_id).await {
                Ok(logs) => {
                    if logs.is_empty() {
                        println!("{}", "No logs recorded yet.".yellow());
                        return Ok(());
                    }

                    // Display chronologically
                    let mut sorted = logs;
                    sorted.reverse();

                    for entry in sorted {
                        println!("{}", entry.log_content);
                    }
                }
                Err(e) => {
                    eprintln!("{} Failed to fetch logs: {}", "✗ ERROR:".red().bold(), e);
                }
            }
        }

        Commands::Ai { app_id, prompt } => {
            println!(
                "{} Dispatching prompt to AI Architect for app {}...",
                "✨ AI Architect:".magenta().bold(),
                app_id.bold()
            );
            println!("  Prompt: \"{}\"\n", prompt.italic());

            let pb = ProgressBar::new_spinner();
            pb.set_style(ProgressStyle::default_spinner().template("{spinner:.magenta} {msg}")?);
            pb.set_message("Synthesizing code & deploying to GitHub...");
            pb.enable_steady_tick(Duration::from_millis(100));

            let client = AetherClient::new(config.clone());
            match client.iterate_with_ai(&app_id, &prompt).await {
                Ok(res) => {
                    pb.finish_and_clear();
                    println!("{} Changes generated and committed!", "✓ SUCCESS:".green().bold());
                    if let Some(summary) = res.summary {
                        println!("  Summary: {}", summary.cyan());
                    }
                    if let Some(msg) = res.commit_message {
                        println!("  Commit:  {}", msg.bold());
                    }
                    if let Some(repo) = res.github_repo {
                        println!("  Repo:    {}", repo.underline());
                    }
                    println!("\nView build logs with: {}", format!("aether logs {}", app_id).bold());
                }
                Err(e) => {
                    pb.finish_and_clear();
                    eprintln!("{} AI iteration failed: {}", "✗ ERROR:".red().bold(), e);
                }
            }
        }
    }

    Ok(())
}
