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
	appDir := fmt.Sprintf("./deployments/%s", safeName)
	if err := os.MkdirAll(appDir, 0755); err != nil {
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cannot create deployment directory: %v", time.Now().Format("15:04:05"), err))
		appLog.Error("cannot create deployment directory", slog.String("error", err.Error()))
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	dbPass := randomPassword()

	if isWorkload(app) {
		provisionWorkloadApp(app, appLog, safeName, appDir, dbPass, controlPlaneURL)
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
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cloning repository: %s", time.Now().Format("15:04:05"), app.GithubRepo))
		appLog.Info("cloning github repository", slog.String("repo", app.GithubRepo))
		_ = exec.Command("rm", "-rf", appDir).Run()

		out, err := runGitWithToken(app.GithubToken, "clone", app.GithubRepo, appDir)
		if err != nil {
			appLog.Warn("git clone failed or repository was empty", slog.String("output", out))
		}

		var envBuilder strings.Builder
		for k, v := range app.EnvVars {
			envBuilder.WriteString(fmt.Sprintf("%s=%s\n", k, v))
		}
		_ = os.WriteFile(fmt.Sprintf("%s/.env", appDir), []byte(envBuilder.String()), 0600)
	}

	if app.GithubRepo != "" {
		if _, err := os.Stat(filepath.Join(appDir, ".git")); os.IsNotExist(err) {
			_ = exec.Command("git", "-C", appDir, "init", "-b", "main").Run()
			_ = exec.Command("git", "-C", appDir, "remote", "add", "origin", app.GithubRepo).Run()
		}
	}

	shouldWriteAiFiles := len(app.AiFiles) > 0
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

	safeCompose := renderRuntimeCompose(app, safeName, hostPwd, baseDomain, dbPass)
	if safeCompose != "" {
		_ = os.WriteFile(fmt.Sprintf("%s/docker-compose.yml", appDir), []byte(safeCompose), 0644)
	}

	// Commit and push without embedding token in URL
	if app.GithubRepo != "" && app.GithubToken != "" && len(app.AiFiles) > 0 {
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
	cmd := exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "up", "-d", "--build")
	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := fmt.Sprintf("[%s] Docker compose failed:\n%s", time.Now().Format("15:04:05"), string(output))
		sendAppLog(controlPlaneURL, app.ID, errMsg)
		appLog.Error("docker compose up failed", slog.String("error", err.Error()), slog.String("output", string(output)))
		updateAppStatus(controlPlaneURL, app.ID, "failed")
		return
	}

	healthPass := waitForRuntimeHealth(app, appLog, safeName, dbPass, controlPlaneURL)
	statusStr := "running"
	containerName := fmt.Sprintf("aetherhost-%s-app-1", safeName)
	if !healthPass {
		cLogs, _ := exec.Command("docker", "logs", "--tail", "50", containerName).CombinedOutput()
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Readiness check timed out after 60s.\nContainer output:\n%s", time.Now().Format("15:04:05"), string(cLogs)))
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

func provisionWorkloadApp(app Application, appLog *slog.Logger, safeName, appDir, dbPass, controlPlaneURL string) {
	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Provisioning Workload: %s", time.Now().Format("15:04:05"), app.DockerImage))
	appLog.Info("provisioning custom docker workload", slog.String("image", app.DockerImage))

	plan, err := buildWorkload(app, dbPass)
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
		for i := 0; i < 30; i++ {
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
		_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("%s/docker-compose.yml", appDir), "-p", "aetherhost-"+safeName, "down").Run()
		statusStr = "failed"
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Health check failed for workload. Container torn down.", time.Now().Format("15:04:05")))
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

	if app.Runtime == "docker" {
		appDir := filepath.Join("deployments", safeName)
		_, port := dockerRuntimeService(appDir, "", detectAppPort(app, appDir))
		path := "/"
		if app.HealthPath != "" && healthPathPattern.MatchString(app.HealthPath) {
			path = app.HealthPath
		}
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Probing readiness for container %s on port %d%s...", time.Now().Format("15:04:05"), containerName, port, path))
		for i := 0; i < 90; i++ {
			if probeContainer(containerName, fmt.Sprintf("http://127.0.0.1:%d%s", port, path)) == nil || (path != "/" && probeContainer(containerName, fmt.Sprintf("http://127.0.0.1:%d/", port)) == nil) {
				appLog.Info("container ready", slog.String("container", containerName), slog.Int("port", port))
				return true
			}
			time.Sleep(2 * time.Second)
		}
		return false
	}
	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Probing readiness for container %s on port 3000...", time.Now().Format("15:04:05"), containerName))
	appLog.Info("probing readiness for container", slog.String("container", containerName))
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
			appLog.Info("container ready and serving requests on port 3000", slog.String("container", containerName))
			return true
		}
		time.Sleep(2 * time.Second)
	}
	return false
}
