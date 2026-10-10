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
	GithubRepo            string            `json:"githubRepo,omitempty"`
	GithubRepoName        string            `json:"githubRepoName,omitempty"`
	GithubRepoDescription string            `json:"githubRepoDescription,omitempty"`
	DockerCompose         string            `json:"dockerCompose,omitempty"`
	CustomDomain          string            `json:"customDomain,omitempty"`
	DockerImage           string            `json:"dockerImage,omitempty"`
	EnvVars               map[string]string `json:"envVars,omitempty"`
	WorkerCommand         string            `json:"workerCommand,omitempty"`
	WithPostgres          bool              `json:"withPostgres,omitempty"`
	WithRedis             bool              `json:"withRedis,omitempty"`
	Port                  int               `json:"port,omitempty"`
	HealthPath            string            `json:"healthPath,omitempty"`
	CommitMessage         string            `json:"commitMessage,omitempty"`
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

func sendAppLog(controlPlaneURL, appID, message string) {
	fmt.Printf("[LOG %s] %s\n", appID, message)
	body, _ := json.Marshal(map[string]string{"log": message})
	req, err := http.NewRequest("POST", fmt.Sprintf("%s/v1/applications/%s/logs", controlPlaneURL, appID), strings.NewReader(string(body)))
	if err == nil {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
		resp, doErr := http.DefaultClient.Do(req)
		if doErr == nil {
			resp.Body.Close()
		}
	}
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

	baseDomain := os.Getenv("BASE_DOMAIN")
	if baseDomain == "" {
		baseDomain = "localhost"
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
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Provisioning Workload: %s", time.Now().Format("15:04:05"), app.DockerImage))
						fmt.Printf("-> Provisioning Workload: %s\n", app.DockerImage)

						plan, err := buildWorkload(app, dbPass)
						if err != nil {
							errMsg := fmt.Sprintf("[%s] Workload build failed: %v", time.Now().Format("15:04:05"), err)
							sendAppLog(controlPlaneURL, app.ID, errMsg)
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
							errMsg := fmt.Sprintf("[%s] Docker compose failed:\n%s", time.Now().Format("15:04:05"), string(output))
							sendAppLog(controlPlaneURL, app.ID, errMsg)
							fmt.Printf("-> Failed to run docker compose: %v\nOutput: %s\n", err, string(output))
							exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
							statusData := `{"status":"failed"}`
							req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
							req.Header.Set("Content-Type", "application/json")
							req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
							http.DefaultClient.Do(req)
							continue
						}

						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Workload containers launched. Checking health probes...", time.Now().Format("15:04:05")))

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
							sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Health check failed for workload. Container torn down.", time.Now().Format("15:04:05")))
						} else {
							sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Workload is healthy and serving requests!", time.Now().Format("15:04:05")))
						}

						statusData := fmt.Sprintf(`{"status":"%s"}`, statusStr)
						reqPatch, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
						reqPatch.Header.Set("Content-Type", "application/json")
						reqPatch.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
						http.DefaultClient.Do(reqPatch)
						fmt.Printf("-> Control plane updated successfully!\n\n")
						continue
					}

					sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Provisioning initiated for '%s' (Runtime: %s)", time.Now().Format("15:04:05"), app.Name, app.Runtime))

					if (app.DockerCompose != "" && rejectTenantCompose(app.DockerCompose)) || !validCustomDomain(app.CustomDomain) {
						errMsg := fmt.Sprintf("[%s] Security check failed: unsafe compose or custom domain", time.Now().Format("15:04:05"))
						sendAppLog(controlPlaneURL, app.ID, errMsg)
						fmt.Printf("-> Security check failed: unsafe compose or custom domain\n")
						statusData := `{"status":"failed"}`
						req, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(statusData))
						req.Header.Set("Content-Type", "application/json")
						req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
						http.DefaultClient.Do(req)
						continue
					}

					if app.GithubRepo != "" {
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cloning repository: %s", time.Now().Format("15:04:05"), app.GithubRepo))
						fmt.Printf("-> Cloning github repository: %s\n", app.GithubRepo)
						exec.Command("rm", "-rf", appDir).Run()

						repoUrl := app.GithubRepo
						if app.GithubToken != "" && strings.HasPrefix(repoUrl, "https://github.com/") {
							repoUrl = strings.Replace(repoUrl, "https://github.com/", fmt.Sprintf("https://%s@github.com/", app.GithubToken), 1)
						}

						cloneCmd := exec.Command("git", "clone", repoUrl, appDir)
						out, err := cloneCmd.CombinedOutput()
						if err != nil {
							fmt.Printf("-> Git clone failed or was empty: %s\n", string(out))
						}

						// Write .env file so the build and runtime can access the variables
						var envStr string
						for k, v := range app.EnvVars {
							envStr += fmt.Sprintf("%s=%s\n", k, v)
						}
						os.WriteFile(fmt.Sprintf("%s/.env", appDir), []byte(envStr), 0644)
					}

					isUnborn := false
					if app.GithubRepo != "" {
						err := exec.Command("git", "-C", appDir, "rev-parse", "HEAD").Run()
						if err != nil {
							isUnborn = true
						}
					}

					shouldWriteAiFiles := (app.GithubRepo == "") || isUnborn || (app.CommitMessage != "")

					if shouldWriteAiFiles {
						if len(app.AiFiles) > 0 {
							sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Writing %d application source files...", time.Now().Format("15:04:05"), len(app.AiFiles)))
						}
						for _, f := range app.AiFiles {
							if strings.Contains(f.Path, "..") || strings.HasPrefix(f.Path, "/") {
								continue
							}
							os.MkdirAll(filepath.Dir(fmt.Sprintf("%s/%s", appDir, f.Path)), 0755)
							os.WriteFile(fmt.Sprintf("%s/%s", appDir, f.Path), []byte(f.Content), 0644)
						}

						gitignorePath := fmt.Sprintf("%s/.gitignore", appDir)
						if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
							os.WriteFile(gitignorePath, []byte("node_modules/\n.env\n.DS_Store\n"), 0644)
						}
					}

					// Commit and push
					if app.GithubRepo != "" && app.GithubToken != "" && (isUnborn || app.CommitMessage != "") && len(app.AiFiles) > 0 {
						msg := app.CommitMessage
						if msg == "" {
							msg = "Initial boilerplate by AetherHost"
						}
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Committing changes: '%s' and pushing to GitHub...", time.Now().Format("15:04:05"), msg))
						exec.Command("git", "-C", appDir, "config", "user.name", "AetherHost Agent").Run()
						exec.Command("git", "-C", appDir, "config", "user.email", fmt.Sprintf("agent@aetherhost.%s", baseDomain)).Run()
						exec.Command("git", "-C", appDir, "add", ".").Run()
						exec.Command("git", "-C", appDir, "commit", "-m", msg).Run()
						repoUrl := app.GithubRepo
						if strings.HasPrefix(repoUrl, "https://github.com/") {
							repoUrl = strings.Replace(repoUrl, "https://github.com/", fmt.Sprintf("https://%s@github.com/", app.GithubToken), 1)
						}
						exec.Command("git", "-C", appDir, "push", "-u", repoUrl, "HEAD:main").Run()
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Successfully pushed commit to GitHub main branch.", time.Now().Format("15:04:05")))
					}

					var safeCompose string

					if app.Runtime == "github" && app.GithubRepo != "" {
						hostRule := "`" + safeName + "." + baseDomain + "`"
						if app.CustomDomain != "" {
							hostRule += " || Host(`" + app.CustomDomain + "`)"
						}
						safeCompose = fmt.Sprintf(`
services:
  app:
    build: .
    env_file: .env
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
`, safeName, hostRule, safeName)
					} else if app.Runtime == "wordpress" {
						hostRule := "`" + safeName + "." + baseDomain + "`"
						if app.CustomDomain != "" {
							hostRule += " || Host(`" + app.CustomDomain + "`)"
						}

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
`, hostPwd, hostPwd, safeName, hostRule, safeName, hostPwd, dbPass, hostPwd, dbPass)
					} else {
						hostRule := "`" + safeName + "." + baseDomain + "`"
						if app.CustomDomain != "" {
							hostRule += " || Host(`" + app.CustomDomain + "`)"
						}
						img, startCmd := runtimeSpec(app.Runtime)
						safeCompose = fmt.Sprintf(`
services:
  app:
    image: %s
    command: sh -c "%s"
    volumes:
      - %s/deployments/%s:/app
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
`, img, startCmd, hostPwd, safeName, safeName, hostRule, safeName)
					}

					if safeCompose != "" {
						os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(safeCompose), 0644)
					}

					sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Building and starting container via Docker Compose...", time.Now().Format("15:04:05")))
					exec.Command("docker", "network", "create", "aetherhost-net").Run()
					cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d", "--build")
					output, err := cmd.CombinedOutput()
					if err != nil {
						errMsg := fmt.Sprintf("[%s] Docker compose failed:\n%s", time.Now().Format("15:04:05"), string(output))
						sendAppLog(controlPlaneURL, app.ID, errMsg)
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
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Waiting for Nginx and MariaDB health checks...", time.Now().Format("15:04:05")))
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
					} else {
						containerName := fmt.Sprintf("aetherhost-%s-app-1", safeName)
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Probing readiness for container %s on port 3000...", time.Now().Format("15:04:05"), containerName))
						fmt.Printf("-> Probing readiness for container %s...\n", containerName)
						healthPass = false
						for i := 0; i < 30; i++ {
							var probeCmd *exec.Cmd
							if app.Runtime == "python" {
								probeCmd = exec.Command("docker", "exec", containerName, "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:3000/')")
							} else if app.Runtime == "nodejs" {
								probeCmd = exec.Command("docker", "exec", containerName, "node", "-e", "fetch('http://localhost:3000/').then(r => process.exit(0)).catch(() => process.exit(1))")
							} else {
								probeCmd = exec.Command("docker", "exec", containerName, "wget", "-q", "-O", "-", "http://localhost:3000/")
							}

							if probeCmd.Run() == nil {
								fmt.Printf("-> Container %s is ready and serving requests on port 3000!\n", containerName)
								healthPass = true
								break
							}
							time.Sleep(2 * time.Second)
						}
					}

					statusStr := "running"
					containerName := fmt.Sprintf("aetherhost-%s-app-1", safeName)
					if !healthPass {
						cLogs, _ := exec.Command("docker", "logs", "--tail", "50", containerName).CombinedOutput()
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Readiness check timed out after 60s.\nContainer output:\n%s", time.Now().Format("15:04:05"), string(cLogs)))
						fmt.Printf("-> Health check failed. Tearing down.\n")
						exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
						statusStr = "failed"
					} else {
						sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Application is healthy, routed via Traefik, and serving traffic on http://%s.%s!", time.Now().Format("15:04:05"), safeName, baseDomain))
						cLogs, _ := exec.Command("docker", "logs", "--tail", "25", containerName).CombinedOutput()
						if len(cLogs) > 0 {
							sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Recent container output:\n%s", time.Now().Format("15:04:05"), string(cLogs)))
						}
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
					safeName := safeAppName(app.Name)
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

		suspUrl := fmt.Sprintf("%s/v1/applications?status=suspending", controlPlaneURL)
		req, _ = http.NewRequest("GET", suspUrl, nil)
		req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
		suspResp, err := http.DefaultClient.Do(req)
		if err == nil {
			suspBody, _ := io.ReadAll(suspResp.Body)
			suspResp.Body.Close()
			var suspApps []Application
			if json.Unmarshal(suspBody, &suspApps) == nil && len(suspApps) > 0 {
				for _, app := range suspApps {
					safeName := safeAppName(app.Name)
					fmt.Printf("-> Suspending container: aetherhost-%s\n", safeName)
					exec.Command("docker", "compose", "-f", fmt.Sprintf("./deployments/%s/docker-compose.yml", safeName), "-p", "aetherhost-"+safeName, "stop").Run()

					patchReq, _ := http.NewRequest("PATCH", fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, app.ID), strings.NewReader(`{"status":"suspended"}`))
					patchReq.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
					patchReq.Header.Set("Content-Type", "application/json")
					patchResp, err := http.DefaultClient.Do(patchReq)
					if err == nil {
						patchResp.Body.Close()
					}
					fmt.Printf("-> Workload suspended: %s\n", safeName)
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
