package main

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func provisionPendingApps(controlPlaneURL, hostPwd, baseDomain string) {
	apps, err := fetchApplicationsByStatus(controlPlaneURL, "pending")
	if err != nil {
		logger.Warn("failed to poll pending applications", slog.String("error", err.Error()))
		return
	}
	for _, app := range apps {
		provisionSingleApp(app, controlPlaneURL, hostPwd, baseDomain)
	}
}

func provisionSingleApp(app Application, controlPlaneURL, hostPwd, baseDomain string) {
	appLog := logger.With(
		slog.String("app_id", app.ID),
		slog.String("app_name", app.Name),
		slog.String("runtime", app.Runtime),
	)
	appLog.Info("starting application provisioning")

	safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
	if isWorkload(app) {
		// Workloads use their immutable application ID for all runtime resources.
		// The display name remains the public hostname, but can never collide with
		// another workload's Compose project, databases, or credentials.
		safeName = workloadDeploymentName(app)
	}
	appDir := fmt.Sprintf("./deployments/%s", safeName)
	if err := os.MkdirAll(appDir, 0755); err != nil {
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cannot create deployment directory: %v", time.Now().Format("15:04:05"), err))
		appLog.Error("cannot create deployment directory", slog.String("error", err.Error()))
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	dbPass := randomPassword()

	if isWorkload(app) {
		provisionWorkloadApp(app, appLog, safeName, appDir, controlPlaneURL)
		return
	}

	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Provisioning initiated for '%s' (Runtime: %s)", time.Now().Format("15:04:05"), app.Name, app.Runtime))

	if (app.DockerCompose != "" && rejectTenantCompose(app.DockerCompose)) || !validCustomDomain(app.CustomDomain) {
		errMsg := fmt.Sprintf("[%s] Security check failed: unsafe compose or custom domain", time.Now().Format("15:04:05"))
		sendAppLog(controlPlaneURL, app.ID, errMsg)
		appLog.Warn("security check failed: unsafe compose or custom domain")
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	if app.GithubRepo != "" {
		if err := syncApplicationRepo(app, appDir, safeName, appLog, controlPlaneURL); err != nil {
			updateAppStatus(controlPlaneURL, app.ID, "failed")
			return
		}
	}

	shouldWriteAiFiles := len(app.AiFiles) > 0 && (app.Runtime != "github" || app.CommitMessage != "")
	if shouldWriteAiFiles {
		sanitized, sanitizeErr := sanitizeAiFiles(app.AiFiles)
		if sanitizeErr != nil {
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Refusing to deploy invalid AI files: %v", time.Now().Format("15:04:05"), sanitizeErr))
			appLog.Error("invalid ai files", slog.String("error", sanitizeErr.Error()))
			updateAppStatus(controlPlaneURL, app.ID, "failed")
			return
		}
		app.AiFiles = sanitized
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Writing %d application source files...", time.Now().Format("15:04:05"), len(app.AiFiles)))
		for _, f := range app.AiFiles {
			if strings.Contains(f.Path, "..") || strings.HasPrefix(f.Path, "/") {
				continue
			}
			_ = os.MkdirAll(filepath.Dir(fmt.Sprintf("%s/%s", appDir, f.Path)), 0755)
			_ = os.WriteFile(fmt.Sprintf("%s/%s", appDir, f.Path), []byte(f.Content), 0644)
		}

		gitignorePath := fmt.Sprintf("%s/.gitignore", appDir)
		if _, err := os.Stat(gitignorePath); os.IsNotExist(err) {
			_ = os.WriteFile(gitignorePath, []byte("node_modules/\n.env\n.DS_Store\n"), 0644)
		}
	}

	// Ensure Cargo.lock exists and is not excluded by .dockerignore if Cargo.toml is present
	if _, err := os.Stat(filepath.Join(appDir, "Cargo.toml")); err == nil {
		if _, err := os.Stat(filepath.Join(appDir, "Cargo.lock")); os.IsNotExist(err) {
			_ = os.WriteFile(filepath.Join(appDir, "Cargo.lock"), []byte(""), 0644)
		}
		dockerignore := filepath.Join(appDir, ".dockerignore")
		if b, err := os.ReadFile(dockerignore); err == nil {
			content := string(b)
			if strings.Contains(content, "Cargo.lock") {
				newContent := strings.ReplaceAll(content, "Cargo.lock\n", "")
				newContent = strings.ReplaceAll(newContent, "Cargo.lock", "")
				_ = os.WriteFile(dockerignore, []byte(newContent), 0644)
			}
		}
	}

	writeEnvFile(app, appDir)

	safeCompose := renderRuntimeCompose(app, safeName, hostPwd, baseDomain, dbPass)
	if safeCompose != "" {
		_ = os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(safeCompose), 0644)
	}

	// Commit and push without embedding token in URL
	if app.GithubRepo != "" && app.GithubToken != "" && len(app.AiFiles) > 0 && (app.Runtime != "github" || app.CommitMessage != "") {
		msg := app.CommitMessage
		if msg == "" {
			msg = "Update application files by AetherHost"
		}
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Committing changes: '%s' and pushing to GitHub...", time.Now().Format("15:04:05"), msg))
		_ = exec.Command("git", "-C", appDir, "config", "user.name", "AetherHost Agent").Run()
		_ = exec.Command("git", "-C", appDir, "config", "user.email", fmt.Sprintf("agent@aetherhost.%s", baseDomain)).Run()
		_ = exec.Command("git", "-C", appDir, "add", ".").Run()
		_ = exec.Command("git", "-C", appDir, "commit", "-m", msg).Run()

		if out, err := runGitWithToken(app.GithubToken, "-C", appDir, "push", "-u", app.GithubRepo, "HEAD:main"); err != nil {
			appLog.Warn("git push failed", slog.String("output", out))
		} else {
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Successfully pushed commit to GitHub main branch.", time.Now().Format("15:04:05")))
		}
	}

	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Building and starting container via Docker Compose...", time.Now().Format("15:04:05")))
	_ = exec.Command("docker", "network", "create", "aetherhost-net").Run()
	_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down", "--remove-orphans").Run()
	cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d", "--build", "--force-recreate")
	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := fmt.Sprintf("[%s] Docker compose failed:\n%s", time.Now().Format("15:04:05"), string(output))
		sendAppLog(controlPlaneURL, app.ID, errMsg)
		appLog.Error("docker compose up failed", slog.String("error", err.Error()), slog.String("output", string(output)))
		if len(app.AiFiles) > 0 && requestAutoFix(controlPlaneURL, app.ID, string(output)) {
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Build failed. AI auto-fix applied; redeploying with corrected files...", time.Now().Format("15:04:05")))
			return
		}
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	healthPass := waitForRuntimeHealth(app, appLog, safeName, dbPass, controlPlaneURL)
	statusStr := "running"
	containerName := fmt.Sprintf("aetherhost-%s-app-1", safeName)
	if !healthPass {
		cLogs, _ := exec.Command("docker", "logs", "--tail", "50", containerName).CombinedOutput()
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Readiness check timed out.\nContainer output:\n%s", time.Now().Format("15:04:05"), string(cLogs)))
		appLog.Warn("readiness check timed out; tearing down container")
		_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
		statusStr = "failed"
	} else {
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Application is healthy, routed via Traefik, and serving traffic on http://%s.%s!", time.Now().Format("15:04:05"), safeName, baseDomain))
		cLogs, _ := exec.Command("docker", "logs", "--tail", "25", containerName).CombinedOutput()
		if len(cLogs) > 0 {
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Recent container output:\n%s", time.Now().Format("15:04:05"), string(cLogs)))
		}
	}

	updateAppStatus(controlPlaneURL, app.ID, statusStr)
	appLog.Info("application provisioning finished", slog.String("final_status", statusStr))
}

func provisionWorkloadApp(app Application, appLog *slog.Logger, safeName, appDir, controlPlaneURL string) {
	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Provisioning Workload: %s", time.Now().Format("15:04:05"), app.DockerImage))
	appLog.Info("provisioning custom docker workload", slog.String("image", app.DockerImage))

	credentials, err := workloadCredentialsFor(appDir)
	if err != nil {
		errMsg := fmt.Sprintf("[%s] Workload credential setup failed: %v", time.Now().Format("15:04:05"), err)
		sendAppLog(controlPlaneURL, app.ID, errMsg)
		appLog.Error("workload credential setup failed", slog.String("error", err.Error()))
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}
	plan, err := buildWorkloadWithIdentity(app, safeName, credentials.PostgresPassword, credentials.MariaDbPassword, credentials.RedisPassword)
	if err != nil {
		errMsg := fmt.Sprintf("[%s] Workload build failed: %v", time.Now().Format("15:04:05"), err)
		sendAppLog(controlPlaneURL, app.ID, errMsg)
		appLog.Error("workload build failed", slog.String("error", err.Error()))
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	_ = os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(plan.Compose), 0644)
	_ = os.WriteFile(fmt.Sprintf("%s/workload.env", appDir), []byte(plan.AppEnv), 0600)
	if plan.PostgresEnv != "" {
		_ = os.WriteFile(fmt.Sprintf("%s/postgres.env", appDir), []byte(plan.PostgresEnv), 0600)
	}
	if plan.MariaDbEnv != "" {
		_ = os.WriteFile(fmt.Sprintf("%s/mariadb.env", appDir), []byte(plan.MariaDbEnv), 0600)
	}
	if plan.RedisEnv != "" {
		_ = os.WriteFile(fmt.Sprintf("%s/redis.env", appDir), []byte(plan.RedisEnv), 0600)
	}

	_ = exec.Command("docker", "network", "create", "aetherhost-net").Run()
	cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d")
	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := fmt.Sprintf("[%s] Docker compose failed:\n%s", time.Now().Format("15:04:05"), string(output))
		sendAppLog(controlPlaneURL, app.ID, errMsg)
		appLog.Error("failed to run workload docker compose", slog.String("error", err.Error()), slog.String("output", string(output)))
		_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Workload containers launched. Checking health probes...", time.Now().Format("15:04:05")))

	healthPass := true
	if plan.HealthPath != "" {
		appLog.Info("waiting for workload health check", slog.String("health_path", plan.HealthPath))
		healthPass = false
		for i := 0; i < 120; i++ {
			if probeContainer(plan.Alias, fmt.Sprintf("http://127.0.0.1:%d%s", plan.Port, plan.HealthPath)) == nil {
				healthPass = true
				break
			}
			time.Sleep(2 * time.Second)
		}
	}

	statusStr := "running"
	if !healthPass {
		appLog.Warn("workload health check failed; tearing down")
		diagnostics := workloadDiagnostics(plan)
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Workload readiness check failed. Captured diagnostics before cleanup:\n%s", time.Now().Format("15:04:05"), diagnostics))
		_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
		statusStr = "failed"
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Health check failed for workload. Containers were removed after diagnostic capture.", time.Now().Format("15:04:05")))
	} else {
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Workload is healthy and serving requests!", time.Now().Format("15:04:05")))
	}

	updateAppStatus(controlPlaneURL, app.ID, statusStr)
	appLog.Info("workload provisioning finished", slog.String("final_status", statusStr))
}

func renderRuntimeCompose(app Application, safeName, hostPwd, baseDomain, dbPass string) string {
	hostRule := "`" + safeName + "." + baseDomain + "`"
	if app.CustomDomain != "" {
		hostRule += " || Host(`" + app.CustomDomain + "`)"
	}

	tlsLabels := ""
	if baseDomain != "localhost" && baseDomain != "127.0.0.1" && !strings.HasSuffix(baseDomain, ".localhost") && baseDomain != "" {
		tlsLabels = fmt.Sprintf("\n      - \"traefik.http.routers.%s-app.entrypoints=websecure\"\n      - \"traefik.http.routers.%s-app.tls.certresolver=letsencrypt\"", safeName, safeName)
	}

	if app.Runtime == "github" && app.GithubRepo != "" {
		return fmt.Sprintf(`
services:
  app:
    build: .
    env_file: .env
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=aetherhost-net"
      - "traefik.http.routers.%s-app.rule=Host(%s)"%s
      - "traefik.http.services.%s-app.loadbalancer.server.port=3000"
    networks:
      - aetherhost-net
networks:
  aetherhost-net:
    external: true
`, safeName, hostRule, tlsLabels, safeName)
	}

	if app.Runtime == "wordpress" {
		return fmt.Sprintf(`
services:
  nginx:
    image: nginx:alpine
    volumes:
      - %s/apps/runtimes/wordpress/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - %s/apps/runtimes/wordpress/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - wordpress_data:/var/www/html
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.%s-app.rule=Host(%s)"%s
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
`, hostPwd, hostPwd, safeName, hostRule, tlsLabels, safeName, hostPwd, dbPass, hostPwd, dbPass)
	}

	if app.Runtime == "docker" {
		return renderDockerRuntimeCompose(app, safeName, hostPwd, hostRule, tlsLabels)
	}

	img, startCmd := runtimeSpec(app.Runtime)
	return fmt.Sprintf(`
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
      - "traefik.http.routers.%s-app.rule=Host(%s)"%s
      - "traefik.http.services.%s-app.loadbalancer.server.port=3000"
    networks:
      - aetherhost-net
networks:
  aetherhost-net:
    external: true
`, img, startCmd, hostPwd, safeName, safeName, hostRule, tlsLabels, safeName)
}

func waitForRuntimeHealth(app Application, appLog *slog.Logger, safeName, dbPass, controlPlaneURL string) bool {
	if app.Runtime == "wordpress" {
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Waiting for Nginx and MariaDB health checks...", time.Now().Format("15:04:05")))
		appLog.Info("waiting for nginx and mariadb health checks")
		for i := 0; i < 60; i++ {
			err1 := exec.Command("docker", "exec", fmt.Sprintf("aetherhost-%s-nginx-1", safeName), "wget", "-q", "-O", "-", wordpressHealthURL).Run()
			err2 := exec.Command("docker", "exec", fmt.Sprintf("aetherhost-%s-db-1", safeName), "mysqladmin", "ping", "-h", "localhost", "-u", "wordpress", "-p"+dbPass, "--silent").Run()
			if err1 == nil && err2 == nil {
				appLog.Info("wordpress health checks passed")
				return true
			}
			time.Sleep(2 * time.Second)
		}
		return false
	}

	containerName := fmt.Sprintf("aetherhost-%s-app-1", safeName)
	appDir := filepath.Join("deployments", safeName)
	port := detectAppPort(app, appDir)
	if port == 0 {
		port = 3000
	}

	candidatePaths := []string{}
	if app.HealthPath != "" && healthPathPattern.MatchString(app.HealthPath) {
		candidatePaths = append(candidatePaths, app.HealthPath)
	}
	for _, p := range []string{"/health", "/ready", "/", "/api/health"} {
		if app.HealthPath != p {
			candidatePaths = append(candidatePaths, p)
		}
	}

	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Probing readiness for container %s on port %d...", time.Now().Format("15:04:05"), containerName, port))
	appLog.Info("probing readiness for container", slog.String("container", containerName), slog.Int("port", port))

	maxAttempts := 45
	if app.Runtime == "docker" || app.Runtime == "github" {
		maxAttempts = 120 // up to ~4 min: apps that boot a database first need it
	}

	for i := 0; i < maxAttempts; i++ {
		// Method 1: probeContainer via alpine:3.20 (netns attached, zero dependency on target container tools)
		for _, path := range candidatePaths {
			if probeContainer(containerName, fmt.Sprintf("http://127.0.0.1:%d%s", port, path)) == nil {
				appLog.Info("container ready via probeContainer", slog.String("container", containerName), slog.Int("port", port), slog.String("path", path))
				return true
			}
		}

		// Method 2: node fetch fallback inside container
		if exec.Command("docker", "exec", containerName, "node", "-e", fmt.Sprintf("fetch('http://127.0.0.1:%d/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))", port)).Run() == nil ||
			exec.Command("docker", "exec", containerName, "node", "-e", fmt.Sprintf("fetch('http://127.0.0.1:%d/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))", port)).Run() == nil {
			appLog.Info("container ready via internal node fetch", slog.String("container", containerName))
			return true
		}

		// Method 3: python fallback inside container
		if app.Runtime == "python" {
			if exec.Command("docker", "exec", containerName, "python", "-c", fmt.Sprintf("import urllib.request; urllib.request.urlopen('http://127.0.0.1:%d/')", port)).Run() == nil {
				appLog.Info("container ready via python urlopen", slog.String("container", containerName))
				return true
			}
		}

		time.Sleep(2 * time.Second)
	}
	return false
}
