package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"os/signal"
	"syscall"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
)

type Application struct {
	ID                    string `json:"id"`
	Name                  string `json:"name"`
	Runtime               string `json:"runtime"`
	Status                string `json:"status"`
	GithubRepo            string `json:"githubRepo"`
	GithubRepoName        string `json:"githubRepoName"`
	GithubRepoDescription string `json:"githubRepoDescription"`
	GithubToken           string `json:"githubToken"`
	DockerCompose         string `json:"dockerCompose"`
	AiFiles               []struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	} `json:"aiFiles"`
}


func getDockerImageAndCmdForRuntime(runtime string) (string, []string) {
	switch runtime {
	case "nodejs":
		return "node:18-alpine", []string{"sh", "-c", "echo 'console.log(\"Hello from Node.js on AetherHost\"); setInterval(() => {}, 1000);' > index.js && node index.js"}
	case "python":
		return "python:3.11-slim", []string{"sh", "-c", "echo 'import time\\nprint(\"Hello from Python on AetherHost\")\\nwhile True: time.sleep(3600)' > main.py && python main.py"}
	case "rust":
		return "rust:slim", []string{"sh", "-c", "cargo new app --bin && cd app && echo 'fn main() { println!(\"Hello from Rust on AetherHost\"); loop { std::thread::sleep(std::time::Duration::from_secs(3600)); } }' > src/main.rs && cargo run"}
	case "go":
		return "golang:1.21-alpine", []string{"sleep", "3600"}
	default:
		return "alpine:latest", []string{"sleep", "3600"}
	}
}

func main() {
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")
	if controlPlaneURL == "" {
		controlPlaneURL = "http://127.0.0.1:3000"
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("Termination signal received. Shutting down gracefully...")
		cancel()
	}()

	fmt.Printf("Starting AetherHost Docker Provisioner... Polling %s\n", controlPlaneURL)

	dockerCli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		fmt.Printf("Fatal: Could not connect to Docker Engine: %v\n", err)
		os.Exit(1)
	}

	

	for {
		select {
		case <-ctx.Done():
			fmt.Println("Worker loop exited cleanly.")
			return
		default:
		}
		url := fmt.Sprintf("%s/v1/applications?status=pending", controlPlaneURL)
		resp, err := func() (*http.Response, error) { req, _ := http.NewRequest("GET", url, nil); req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY")); return http.DefaultClient.Do(req) }()
		
		if err != nil {
			select { case <-ctx.Done(): return; case <-time.After(5 * time.Second): }
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			select { case <-ctx.Done(): return; case <-time.After(5 * time.Second): }
			continue
		}

		var apps []Application
		if err := json.Unmarshal(body, &apps); err != nil {
			select { case <-ctx.Done(): return; case <-time.After(5 * time.Second): }
			continue
		}

		for _, app := range apps {
			fmt.Printf("Provisioning app: %s (Runtime: %s)\n", app.Name, app.Runtime)
			
			safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
			
			if app.DockerCompose != "" {
			    if strings.Contains(app.DockerCompose, "privileged:") || strings.Contains(app.DockerCompose, "/var/run/docker.sock") {
			        fmt.Printf("-> Security check failed: unsafe compose file\n")
			        continue
			    }

			    appDir := fmt.Sprintf("./deployments/%s", safeName)
			    os.MkdirAll(appDir, 0755)
			    for _, f := range app.AiFiles {
			        if strings.Contains(f.Path, "..") || strings.HasPrefix(f.Path, "/") {
			            fmt.Printf("-> Security check failed: unsafe file path\n")
			            continue
			        }

			        os.MkdirAll(filepath.Dir(fmt.Sprintf("%s/%s", appDir, f.Path)), 0755)
			        os.WriteFile(fmt.Sprintf("%s/%s", appDir, f.Path), []byte(f.Content), 0644)
			    }
			    
			// We MUST NOT execute tenant-provided docker-compose strings (security risk: host mounts, privileged, etc)
			// Instead, we generate a strictly controlled, isolated Compose file based on the selected runtime.
			appImage, _ := getDockerImageAndCmdForRuntime(app.Runtime)
			
			var safeCompose string
				if app.Runtime == "wordpress" {
					safeCompose = fmt.Sprintf(`
services:
  nginx:
    image: nginx:alpine
    volumes:
      - /app/apps/runtimes/wordpress/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - /app/apps/runtimes/wordpress/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - wordpress_data:/var/www/html
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.%s-app.rule=Host(%s.localhost)"
      - "traefik.http.services.%s-app.loadbalancer.server.port=80"
      - "traefik.docker.network=aetherhost-net"
    networks:
      - aetherhost-net
    depends_on:
      - php
  php:
    image: wordpress:php8.2-fpm-alpine
    volumes:
      - /app/apps/runtimes/wordpress/php/zzz-custom.conf:/usr/local/etc/php-fpm.d/zzz-custom.conf:ro
      - wordpress_data:/var/www/html
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: aether-secret-pass
      WORDPRESS_DB_NAME: wordpress
    networks:
      - aetherhost-net
    depends_on:
      - db
  db:
    image: mariadb:10.11
    command: --defaults-file=/etc/mysql/mariadb.cnf
    volumes:
      - /app/apps/runtimes/wordpress/mariadb.cnf:/etc/mysql/mariadb.cnf:ro
      - db_data:/var/lib/mysql
    environment:
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: aether-secret-pass
      MARIADB_RANDOM_ROOT_PASSWORD: "1"
    networks:
      - aetherhost-net

volumes:
  wordpress_data:
  db_data:

networks:
  aetherhost-net:
    external: true
`, safeName, "\`"+safeName+"\`", safeName)
			} else {
				startCmd := "sleep 3600"
				if app.Runtime == "nodejs" {
					startCmd = "npm install --no-fund && npm start"
				} else if app.Runtime == "python" {
					startCmd = "pip install -r requirements.txt && python main.py"
				}
				
				safeCompose = fmt.Sprintf(`
services:
  app:
    image: %s
    command: sh -c "%s"
    volumes:
      - .:/app
    working_dir: /app
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=aetherhost-net"
      - "traefik.http.routers.%s-app.rule=Host(%s.localhost)"
      - "traefik.http.services.%s-app.loadbalancer.server.port=3000"
  code-server:
    image: codercom/code-server:latest
    command: --auth none
    volumes:
      - .:/home/coder/project
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=aetherhost-net"
      - "traefik.http.routers.%s-ide.rule=Host(%s-ide.localhost)"
      - "traefik.http.services.%s-ide.loadbalancer.server.port=8080"
`, appImage, startCmd, safeName, "`"+safeName+"`", safeName, safeName, "`"+safeName+"`", safeName)
			}

			os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(safeCompose), 0644)
				
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
						}
					}
				}
				
				exec.Command("docker", "network", "create", "aetherhost-net").Run()
				cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d", "--build")
				output, err := cmd.CombinedOutput()
				if err != nil {
					fmt.Printf("-> Failed to run docker compose: %v\nOutput: %s\n", err, string(output))
					statusData := `{"status":"failed"}`
					req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
					http.DefaultClient.Do(req)
					continue
				}
				exec.Command("docker", "network", "connect", "aetherhost-net", fmt.Sprintf("aetherhost-%s-code-server-1", safeName)).Run()
				exec.Command("docker", "network", "connect", "aetherhost-net", fmt.Sprintf("aetherhost-%s-app-1", safeName)).Run()
			} else {
				// SRE Track: Use official Docker SDK instead of exec.Command
				ctx := context.Background()
				imageName, cmd := getDockerImageAndCmdForRuntime(app.Runtime)
				
				fmt.Printf("-> Pulling image %s via Docker SDK...\n", imageName)
				reader, err := dockerCli.ImagePull(ctx, imageName, image.PullOptions{})
				if err != nil {
					fmt.Printf("-> Failed to pull image: %v\n", err)
				} else {
					io.Copy(os.Stdout, reader)
					reader.Close()
				}

				fmt.Printf("-> Creating container via Docker SDK...\n")
				resp, err := dockerCli.ContainerCreate(ctx, &container.Config{
					Image: imageName,
					Cmd:   cmd,
					Labels: map[string]string{
						"traefik.enable": "true",
						"traefik.http.routers." + safeName + ".rule": "Host(`" + safeName + ".localhost`)",
					},
				}, &container.HostConfig{
					AutoRemove: true,
				}, nil, nil, "aetherhost-" + safeName)
				
				if err != nil {
					fmt.Printf("-> SDK ContainerCreate failed: %v\n", err)
					statusData := `{"status":"failed"}`
					req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
					req.Header.Set("Content-Type", "application/json")
					req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
					http.DefaultClient.Do(req)
					continue
				}

				if err := dockerCli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
					fmt.Printf("-> SDK ContainerStart failed: %v\n", err)
					continue
				}
				
				fmt.Printf("-> Container %s started successfully via Docker SDK!\n", app.Name)
			}

			// Update control plane status
			statusData := `{"status":"running"}`
			req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
			http.DefaultClient.Do(req)
			fmt.Printf("-> Control plane updated successfully!\n\n")
		}

		termUrl := fmt.Sprintf("%s/v1/applications?status=terminating", controlPlaneURL)
		req, _ := http.NewRequest("GET", termUrl, nil)
		req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
		termResp, err := http.DefaultClient.Do(req)
		if err == nil {
			termBody, _ := io.ReadAll(termResp.Body)
			termResp.Body.Close()
			var termApps []Application
			if json.Unmarshal(termBody, &termApps) == nil && len(termApps) > 0 {
				for _, app := range termApps {
					safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
					fmt.Printf("-> Stopping and removing container: aetherhost-%s\n", safeName)
					
					// Use SDK to remove container if it exists
					ctx := context.Background()
					if err := dockerCli.ContainerRemove(ctx, "aetherhost-"+safeName, container.RemoveOptions{Force: true}); err != nil {
					    // Fallback to exec for compose projects
					    exec.Command("docker", "compose", "-f", fmt.Sprintf("./deployments/%s/docker-compose.yml", safeName), "-p", "aetherhost-"+safeName, "down").Run()
					}
					os.RemoveAll(fmt.Sprintf("./deployments/%s", safeName))
					
					delReq, _ := http.NewRequest("DELETE", fmt.Sprintf("%s/v1/applications/%s/hard", controlPlaneURL, app.ID), nil)
					delReq.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
					delResp, err := http.DefaultClient.Do(delReq)
					if err == nil {
						delResp.Body.Close()
					}
					fmt.Printf("-> Hard delete completed.\n")
				}
			}
		}

		select { case <-ctx.Done(): return; case <-time.After(5 * time.Second): }
	}
}
