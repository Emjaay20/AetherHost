package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"bytes"
	
	"time"
	"path/filepath"
)

type File struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

type Application struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Runtime       string `json:"runtime"`
	Status        string `json:"status"`
	DockerCompose string `json:"dockerCompose"`
	GithubRepo    string `json:"githubRepo"`
	GithubToken   string `json:"githubToken"`
	GithubRepoName        string `json:"githubRepoName"`
	GithubRepoDescription string `json:"githubRepoDescription"`
	AiFiles       []File `json:"aiFiles"`
}

func getDockerArgsForRuntime(rawName, runtime string) (string, []string) {
	safeName := strings.ReplaceAll(strings.ToLower(rawName), " ", "-")
	exec.Command("docker", "network", "create", "aetherhost-net").Run()

	labelRouter := fmt.Sprintf("traefik.http.routers.%s.rule=Host(`%s.localhost`)", safeName, safeName)
	baseArgs := []string{"run", "-d", "--name", "aetherhost-" + safeName, "--network", "aetherhost-net", "--label", "traefik.enable=true", "--label", labelRouter}

	switch runtime {
	case "wordpress":
		exec.Command("docker", "network", "create", "aetherhost-net").Run()
		dbName := "aetherhost-db-" + safeName
		exec.Command("docker", "run", "-d", "--name", dbName, "--network", "aetherhost-net", "-e", "MYSQL_ROOT_PASSWORD=aetherpass", "-e", "MYSQL_DATABASE=wordpress", "mysql:8.0").Run()
		time.Sleep(5 * time.Second)
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

		for _, app := range apps {
			fmt.Printf("Provisioning app: %s (Runtime: %s)\n", app.Name, app.Runtime)
			
			safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
			
			if app.DockerCompose != "" {
			    appDir := fmt.Sprintf("./deployments/%s", safeName)
			    os.MkdirAll(appDir, 0755)
			    for _, f := range app.AiFiles {
			        os.MkdirAll(filepath.Dir(fmt.Sprintf("%s/%s", appDir, f.Path)), 0755)
			        os.WriteFile(fmt.Sprintf("%s/%s", appDir, f.Path), []byte(f.Content), 0644)
			    }
			    
			    ideConfig := fmt.Sprintf(`
  code-server:
    image: codercom/code-server:latest
    command: --auth none
    volumes:
      - .:/home/coder/project
    labels:
      - "traefik.enable=true"\n      - "traefik.docker.network=aetherhost-net"
      - "traefik.http.routers.%s-ide.rule=Host(%s-ide.localhost%s)"
      - "traefik.http.services.%s-ide.loadbalancer.server.port=8080"
`, safeName, "`"+safeName, "`", safeName)

				modifiedCompose := app.DockerCompose
				if !strings.Contains(modifiedCompose, "code-server:") {
					modifiedCompose += ideConfig
				}
				os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(modifiedCompose), 0644)
				
				if app.GithubToken != "" {
					fmt.Println("-> GitHub Token detected! Creating repo and pushing code...")
					repoNameToUse := app.GithubRepoName
					if repoNameToUse == "" {
						repoNameToUse = fmt.Sprintf("aetherhost-%s", safeName)
					}
					repoDescToUse := app.GithubRepoDescription
					
					repoDataBytes, _ := json.Marshal(map[string]interface{}{
						"name": repoNameToUse,
						"private": false,
						"description": repoDescToUse,
					})
					req, _ := http.NewRequest("POST", "https://api.github.com/user/repos", bytes.NewReader(repoDataBytes))
					req.Header.Set("Authorization", "Bearer "+app.GithubToken)
					req.Header.Set("Accept", "application/vnd.github.v3+json")
					resp, err := http.DefaultClient.Do(req)
					if err == nil {
						var resData map[string]interface{}
						json.NewDecoder(resp.Body).Decode(&resData)
						resp.Body.Close()
						
						cloneUrl, ok := resData["clone_url"].(string)
						if ok {
							authUrl := strings.Replace(cloneUrl, "https://", fmt.Sprintf("https://oauth2:%s@", app.GithubToken), 1)
							exec.Command("git", "-C", appDir, "init").Run()
							exec.Command("git", "-C", appDir, "add", ".").Run()
							exec.Command("git", "-C", appDir, "commit", "-m", "Initial commit from AetherHost AI").Run()
							exec.Command("git", "-C", appDir, "branch", "-M", "main").Run()
							exec.Command("git", "-C", appDir, "remote", "add", "origin", authUrl).Run()
							exec.Command("git", "-C", appDir, "push", "-u", "origin", "main").Run()
							fmt.Println("-> Successfully pushed AI code to GitHub!")
						} else {
							fmt.Println("-> Failed to create GitHub repo:", resData)
						}
					}
				}
				
				fmt.Printf("-> Executing docker compose for %s\n", app.Name)
				exec.Command("docker", "network", "create", "aetherhost-net").Run()
				cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d", "--build")
				output, err := cmd.CombinedOutput()
				if err != nil {
					fmt.Printf("-> Failed to run docker compose: %v\nOutput: %s\n", err, string(output))
					statusData := `{"status":"errored"}`
					req, _ := http.NewRequest("POST", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("x-agent-key", "aether-secret")
					http.DefaultClient.Do(req)
					continue
				}
				exec.Command("docker", "network", "connect", "aetherhost-net", fmt.Sprintf("aetherhost-%s-code-server-1", safeName)).Run()
				exec.Command("docker", "network", "connect", "aetherhost-net", fmt.Sprintf("aetherhost-%s-app-1", safeName)).Run()
			} else {
				_, args := getDockerArgsForRuntime(app.Name, app.Runtime)
				fmt.Printf("-> Executing: docker %v\n", args)
				cmd := exec.Command("docker", args...)
				output, err := cmd.CombinedOutput()
				if err != nil {
					fmt.Printf("-> Failed to create container: %v\nOutput: %s\n", err, string(output))
					statusData := `{"status":"errored"}`
					req, _ := http.NewRequest("POST", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("x-agent-key", "aether-secret")
					http.DefaultClient.Do(req)
					continue
				}
				fmt.Printf("-> Container %s started successfully!\n", app.Name)
			}

			// Update control plane status
			statusData := `{"status":"running"}`
			req, _ := http.NewRequest("POST", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("x-agent-key", "aether-secret")
			http.DefaultClient.Do(req)
			fmt.Printf("-> Control plane updated successfully!\n\n")
		}

		termUrl := fmt.Sprintf("%s/v1/applications?status=terminating", controlPlaneURL)
		req, _ := http.NewRequest("GET", termUrl, nil)
		req.Header.Set("x-agent-key", "aether-secret")
		termResp, err := http.DefaultClient.Do(req)
		if err == nil {
			termBody, _ := io.ReadAll(termResp.Body)
			termResp.Body.Close()
			var termApps []Application
			if json.Unmarshal(termBody, &termApps) == nil && len(termApps) > 0 {
				fmt.Printf("Found %d terminating applications\n", len(termApps))
				for _, app := range termApps {
					safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
					fmt.Printf("-> Stopping and removing container: aetherhost-%s\n", safeName)
					exec.Command("docker", "rm", "-f", "aetherhost-"+safeName).Run()
					exec.Command("docker", "compose", "-f", fmt.Sprintf("./deployments/%s/docker-compose.yml", safeName), "-p", "aetherhost-"+safeName, "down").Run()
					os.RemoveAll(fmt.Sprintf("./deployments/%s", safeName))
					
					delReq, _ := http.NewRequest("DELETE", fmt.Sprintf("%s/v1/applications/%s/hard", controlPlaneURL, app.ID), nil)
					delReq.Header.Set("x-agent-key", "aether-secret")
					delResp, err := http.DefaultClient.Do(delReq)
					if err == nil {
						delResp.Body.Close()
					}
					fmt.Printf("-> Hard delete completed.\n")
				}
			}
		}

		time.Sleep(5 * time.Second)
	}
}
