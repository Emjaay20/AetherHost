package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type Application struct {
	ID                    string            `json:"id"`
	Name                  string            `json:"name"`
	Runtime               string            `json:"runtime"`
	Status                string            `json:"status"`
	GithubToken           string            `json:"githubToken,omitempty"`
	GithubRepoName        string            `json:"githubRepoName,omitempty"`
	GithubRepoDescription string            `json:"githubRepoDescription,omitempty"`
	DockerCompose         string            `json:"dockerCompose,omitempty"`
	DockerImage           string            `json:"dockerImage,omitempty"`
	EnvVars               map[string]string `json:"envVars,omitempty"`
	WorkerCommand         string            `json:"workerCommand,omitempty"`
	WithPostgres          bool              `json:"withPostgres,omitempty"`
	WithRedis             bool              `json:"withRedis,omitempty"`
	Port                  int               `json:"port,omitempty"`
	HealthPath            string            `json:"healthPath,omitempty"`
	AiFiles               []struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	} `json:"aiFiles,omitempty"`
}

func randomPassword() string {
	chars := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 16)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func main() {
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")
	if controlPlaneURL == "" {
		controlPlaneURL = "http://localhost:3000"
	}

	hostPwd := os.Getenv("HOST_PWD")
	if hostPwd == "" {
		hostPwd = "/opt/aetherhost" // fallback
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	fmt.Println("AetherHost Go Agent Started. Polling control plane...")

	for {
		if ctx.Err() != nil {
			fmt.Println("Shutdown signal received. Exiting.")
			return
		}
		url := fmt.Sprintf("%s/v1/applications?status=pending", controlPlaneURL)
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))

		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			var apps []Application
			if json.Unmarshal(body, &apps) == nil && len(apps) > 0 {
				for _, app := range apps {
					fmt.Printf("Provisioning app: %s (Runtime: %s)\n", app.Name, app.Runtime)
					safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
					appDir := fmt.Sprintf("./deployments/%s", safeName)
					os.MkdirAll(appDir, 0755)

					dbPass := randomPassword()

					if isWorkload(app) {
						fmt.Printf("-> Provisioning Workload: %s\n", app.DockerImage)

						plan, err := buildWorkload(app, dbPass)
						if err != nil {
							fmt.Printf("-> Workload build failed: %v\n", err)
							statusData := `{"status":"failed"}`
							req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
							req.Header.Set("Content-Type", "application/json")
							req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
							http.DefaultClient.Do(req)
							continue
						}

						os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(plan.Compose), 0644)
						os.WriteFile(fmt.Sprintf("%s/workload.env", appDir), []byte(plan.AppEnv), 0600)
						if plan.PostgresEnv != "" {
							os.WriteFile(fmt.Sprintf("%s/postgres.env", appDir), []byte(plan.PostgresEnv), 0600)
						}

						exec.Command("docker", "network", "create", "aetherhost-net").Run()
						cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d")
						output, err := cmd.CombinedOutput()
						if err != nil {
							fmt.Printf("-> Failed to run docker compose: %v\nOutput: %s\n", err, string(output))
							exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
							statusData := `{"status":"failed"}`
							req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
							req.Header.Set("Content-Type", "application/json")
							req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
							http.DefaultClient.Do(req)
							continue
						}

						// wait for health check if applicable
						healthPass := true
						if plan.HealthPath != "" {
							fmt.Printf("-> Waiting for workload API health check at %s...\n", plan.HealthPath)
							healthPass = false
							for i := 0; i < 30; i++ {
								errProbe := probeContainer(plan.Alias, fmt.Sprintf("http://127.0.0.1:%d%s", plan.Port, plan.HealthPath))
								if errProbe == nil {
									healthPass = true
									break
								}
								time.Sleep(2 * time.Second)
							}
						}

						statusStr := "running"
						if !healthPass {
							fmt.Printf("-> Health check failed. Tearing down.\n")
							exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
							statusStr = "failed"
						}

						statusData := fmt.Sprintf(`{"status":"%s"}`, statusStr)
						reqPatch, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
						reqPatch.Header.Set("Content-Type", "application/json")
						reqPatch.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
						http.DefaultClient.Do(reqPatch)
						fmt.Printf("-> Control plane updated successfully!\n\n")
						continue
					}

					if app.DockerCompose != "" {
						if rejectTenantCompose(app.DockerCompose) {
							fmt.Printf("-> Security check failed: unsafe compose file\n")
							continue
						}
						for _, f := range app.AiFiles {
							if strings.Contains(f.Path, "..") || strings.HasPrefix(f.Path, "/") {
								continue
							}
							os.MkdirAll(filepath.Dir(fmt.Sprintf("%s/%s", appDir, f.Path)), 0755)
							os.WriteFile(fmt.Sprintf("%s/%s", appDir, f.Path), []byte(f.Content), 0644)
						}
					}

					var safeCompose string

					if app.Runtime == "wordpress" {

						safeCompose = fmt.Sprintf(`
services:
  nginx:
    image: nginx:alpine
    volumes:
      - %s/apps/runtimes/wordpress/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - %s/apps/runtimes/wordpress/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - wordpress_data:/var/www/html
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.%s-app.rule=Host(%s)"
      - "traefik.http.services.%s-app.loadbalancer.server.port=80"
      - "traefik.docker.network=aetherhost-net"
    networks:
      - aetherhost-net
    depends_on:
      - php
  php:
    image: wordpress:php8.2-fpm-alpine
    volumes:
      - %s/apps/runtimes/wordpress/php/zzz-custom.conf:/usr/local/etc/php-fpm.d/zzz-custom.conf:ro
      - wordpress_data:/var/www/html
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: %s
      WORDPRESS_DB_NAME: wordpress
    networks:
      - aetherhost-net
    depends_on:
      - db
  db:
    image: mariadb:10.11
    volumes:
      - %s/apps/runtimes/wordpress/mariadb.cnf:/etc/mysql/conf.d/mariadb.cnf:ro
      - db_data:/var/lib/mysql
    environment:
      MARIADB_DATABASE: wordpress
      MARIADB_USER: wordpress
      MARIADB_PASSWORD: %s
      MARIADB_RANDOM_ROOT_PASSWORD: "1"
    networks:
      - aetherhost-net

volumes:
  wordpress_data:
  db_data:

networks:
  aetherhost-net:
    external: true
`, hostPwd, hostPwd, safeName, "`"+safeName+".localhost`", safeName, hostPwd, dbPass, hostPwd, dbPass)
					} else {
						img, startCmd := runtimeSpec(app.Runtime)
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
      - "traefik.http.routers.%s-app.rule=Host(%s)"
      - "traefik.http.services.%s-app.loadbalancer.server.port=3000"
    networks:
      - aetherhost-net
networks:
  aetherhost-net:
    external: true
`, img, startCmd, safeName, "`"+safeName+".localhost`", safeName)
					}

					os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(safeCompose), 0644)

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

					healthPass := true

					if app.Runtime == "wordpress" {
						fmt.Printf("-> Waiting for Nginx and MariaDB health checks...\n")
						healthPass = false
						for i := 0; i < 60; i++ {
							err1 := exec.Command("docker", "exec", fmt.Sprintf("aetherhost-%s-nginx-1", safeName), "wget", "-q", "-O", "-", wordpressHealthURL).Run()
							err2 := exec.Command("docker", "exec", fmt.Sprintf("aetherhost-%s-db-1", safeName), "mysqladmin", "ping", "-h", "localhost", "-u", "wordpress", "-p"+dbPass, "--silent").Run()
							if err1 == nil && err2 == nil {
								fmt.Printf("-> Health checks passed!\n")
								healthPass = true
								break
							}
							time.Sleep(2 * time.Second)
						}
					}

					statusStr := "running"
					if !healthPass {
						fmt.Printf("-> Health check failed. Tearing down.\n")
						exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
						statusStr = "failed"
					}

					statusData := fmt.Sprintf(`{"status":"%s"}`, statusStr)
					reqPatch, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
					reqPatch.Header.Set("Content-Type", "application/json")
					reqPatch.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
					http.DefaultClient.Do(reqPatch)
					fmt.Printf("-> Control plane updated successfully!\n\n")
				}
			}
		}

		termUrl := fmt.Sprintf("%s/v1/applications?status=terminating", controlPlaneURL)
		req, _ = http.NewRequest("GET", termUrl, nil)
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
					exec.Command("docker", "compose", "-f", fmt.Sprintf("./deployments/%s/docker-compose.yml", safeName), "-p", "aetherhost-"+safeName, "down").Run()
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

		select {
		case <-ctx.Done():
			fmt.Println("Shutdown signal received. Exiting.")
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func probeContainer(container, rawURL string) error {
	return exec.Command("docker", "run", "--rm", "--network", "container:"+container, "alpine:3.20", "wget", "-q", "-O", "-", rawURL).Run()
}
