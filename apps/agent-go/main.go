package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
)

type Application struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Runtime string `json:"runtime"`
	Status  string `json:"status"`
}

func getDockerArgsForRuntime(rawName, runtime string) (string, []string) {
	// Sanitize name for docker and traefik
	safeName := strings.ReplaceAll(strings.ToLower(rawName), " ", "-")
	
	// Create network if it doesn't exist
	exec.Command("docker", "network", "create", "aetherhost-net").Run()

	labelRouter := fmt.Sprintf("traefik.http.routers.%s.rule=Host(`%s.localhost`)", safeName, safeName)
	baseArgs := []string{"run", "-d", "--name", "aetherhost-" + safeName, "--network", "aetherhost-net", "--label", "traefik.enable=true", "--label", labelRouter}

	switch runtime {
	case "wordpress":
		// Create a network if it doesn't exist
		exec.Command("docker", "network", "create", "aetherhost-net").Run()
		
		// Spin up a MySQL database for this WP instance
		dbName := "aetherhost-db-" + safeName
		exec.Command("docker", "run", "-d", "--name", dbName, "--network", "aetherhost-net", "-e", "MYSQL_ROOT_PASSWORD=aetherpass", "-e", "MYSQL_DATABASE=wordpress", "mysql:8.0").Run()
		
		// Wait a few seconds for MySQL to initialize before starting WP
		time.Sleep(5 * time.Second)

		// Append network and env vars to WordPress container
		wpArgs := append(baseArgs, "-e", "WORDPRESS_DB_HOST="+dbName, "-e", "WORDPRESS_DB_USER=root", "-e", "WORDPRESS_DB_PASSWORD=aetherpass", "wordpress:latest")
		return "wordpress:latest", wpArgs
	case "nodejs":
		return "node:20-alpine", append(baseArgs, "node:20-alpine", "sh", "-c", "echo \"const http = require('http'); http.createServer((q,r) => r.end('Hello from AetherHost Node Server!')).listen(8080);\" > server.js && node server.js")
	case "python":
		return "python:3.11-alpine", append(baseArgs, "python:3.11-alpine", "sh", "-c", "echo 'Hello from AetherHost Python Server!' > index.html && python -m http.server 8080")
	case "rust":
		return "rust:slim", append(baseArgs, "rust:slim", "sh", "-c", "cargo new app --bin && cd app && echo 'fn main() { println!(\"Hello from Rust on AetherHost\"); loop { std::thread::sleep(std::time::Duration::from_secs(3600)); } }' > src/main.rs && cargo run")
	case "go":
		return "golang:1.21-alpine", append(baseArgs, "golang:1.21-alpine", "sleep", "3600")
	default:
		return "alpine:latest", append(baseArgs, "alpine:latest", "sleep", "3600")
	}
}

func main() {
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")
	if controlPlaneURL == "" {
		controlPlaneURL = "http://127.0.0.1:3000"
	}

	fmt.Printf("Starting AetherHost Docker Provisioner... Polling %s\n", controlPlaneURL)

	go startTelemetryReporter(controlPlaneURL)

	for {
		// 1. List all pending apps
		url := fmt.Sprintf("%s/v1/applications?status=pending", controlPlaneURL)
		resp, err := func() (*http.Response, error) { req, _ := http.NewRequest("GET", url, nil); req.Header.Set("x-agent-key", "aether-secret"); return http.DefaultClient.Do(req) }()
		
		if err != nil {
			fmt.Printf("Error polling control plane: %v\n", err)
			time.Sleep(5 * time.Second)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			fmt.Printf("Error reading response: %v\n", err)
			time.Sleep(5 * time.Second)
			continue
		}

		var apps []Application
		if err := json.Unmarshal(body, &apps); err != nil {
			fmt.Printf("Error parsing JSON: %v\n", err)
			time.Sleep(5 * time.Second)
			continue
		}

		if len(apps) > 0 {
			fmt.Printf("Found %d pending applications\n", len(apps))
		}

		// 2. Provision each app via Docker CLI
		for _, app := range apps {
			fmt.Printf("Provisioning app: %s (Runtime: %s)\n", app.Name, app.Runtime)
			
			_, args := getDockerArgsForRuntime(app.Name, app.Runtime)

			fmt.Printf("-> Executing: docker %v\n", args)
			cmd := exec.Command("docker", args...)
			
			output, err := cmd.CombinedOutput()
			if err != nil {
				fmt.Printf("-> Failed to create container: %v\nOutput: %s\n", err, string(output))
				continue
			}

			fmt.Printf("-> Container %s started successfully!\n", app.Name)

			// 3. Mark as active in NestJS control plane
			provUrl := fmt.Sprintf("%s/v1/provisioning/%s", controlPlaneURL, app.ID)
			provReq, _ := http.NewRequest("POST", provUrl, bytes.NewBuffer([]byte{}))
			
			provResp, err := http.DefaultClient.Do(provReq)
			if err != nil {
				fmt.Printf("-> Failed to notify control plane: %v\n", err)
				continue
			}
			provResp.Body.Close()

			fmt.Printf("-> Control plane updated successfully!\n\n")
		}

		// 4. Handle Terminating Apps
		termUrl := fmt.Sprintf("%s/v1/applications?status=terminating", controlPlaneURL)
		termResp, err := http.Get(termUrl)
		if err == nil {
			termBody, _ := io.ReadAll(termResp.Body)
			termResp.Body.Close()
			var termApps []Application
			if json.Unmarshal(termBody, &termApps) == nil && len(termApps) > 0 {
				fmt.Printf("Found %d terminating applications\n", len(termApps))
				for _, app := range termApps {
					safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
					containerName := "aetherhost-" + safeName
					
					fmt.Printf("-> Stopping and removing container: %s\n", containerName)
					exec.Command("docker", "rm", "-f", containerName).Run()
					
					fmt.Printf("-> Container removed. Hard deleting from database...\n")
					
					delReq, _ := http.NewRequest("DELETE", fmt.Sprintf("%s/v1/applications/%s/hard", controlPlaneURL, app.ID), nil)
					func() (*http.Response, error) { delReq.Header.Set("x-agent-key", "aether-secret"); return http.DefaultClient.Do(delReq) }()
				}
			}
		}

		time.Sleep(5 * time.Second)
	}
}
