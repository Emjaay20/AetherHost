package main

import (
	"fmt"
	"regexp"
	"strings"
)

const wordpressHealthURL = "http://localhost/fpm-ping"

var (
	imagePattern         = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,200}$`)
	healthPathPattern    = regexp.MustCompile(`^/[a-zA-Z0-9._/-]{0,80}$`)
	workerCommandPattern = regexp.MustCompile(`^[A-Za-z0-9_ ./:=@,-]{1,200}$`)
	envKeyPattern        = regexp.MustCompile(`^[A-Z_][A-Z0-9_]{0,63}$`)
)

func runtimeSpec(runtime string) (string, string) {
	switch runtime {
	case "nodejs":
		return "node:18-alpine", "npm install --no-fund && npm start"
	case "python":
		return "python:3.11-slim", "pip install -r requirements.txt && python main.py"
	default:
		return "alpine:latest", "sleep 3600"
	}
}

func rejectTenantCompose(compose string) bool {
	return strings.Contains(compose, "privileged:") || strings.Contains(compose, "/var/run/docker.sock")
}

func isWorkload(app Application) bool {
	return app.Runtime != "wordpress" && strings.TrimSpace(app.DockerImage) != ""
}

func safeAppName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	dash := false
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
			continue
		}
		if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	s := strings.Trim(b.String(), "-")
	if len(s) > 40 {
		s = strings.Trim(s[:40], "-")
	}
	if s == "" {
		return "app"
	}
	return s
}

func isReservedEnv(key string) bool {
	switch key {
	case "DATABASE_URL", "REDIS_URL", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "AETHERHOST_WORKER_COMMAND":
		return true
	default:
		return false
	}
}

type WorkloadPlan struct {
	Compose     string
	AppEnv      string
	PostgresEnv string
	Alias       string
	Port        int
	HealthPath  string
}

func buildWorkload(app Application, dbPass string) (WorkloadPlan, error) {
	if app.Runtime == "wordpress" {
		return WorkloadPlan{}, fmt.Errorf("wordpress is not a workload")
	}
	image := strings.TrimSpace(app.DockerImage)
	if !imagePattern.MatchString(image) || strings.Contains(image, "..") || strings.Contains(image, "://") {
		return WorkloadPlan{}, fmt.Errorf("invalid image")
	}
	port := app.Port
	if port == 0 {
		port = 3000
	}
	if port < 1 || port > 65535 {
		return WorkloadPlan{}, fmt.Errorf("invalid port")
	}
	healthPath := strings.TrimSpace(app.HealthPath)
	if healthPath == "" {
		healthPath = "/health"
	}
	if !healthPathPattern.MatchString(healthPath) || strings.Contains(healthPath, "..") {
		return WorkloadPlan{}, fmt.Errorf("invalid health path")
	}
	worker := strings.TrimSpace(app.WorkerCommand)
	if worker != "" && !workerCommandPattern.MatchString(worker) {
		return WorkloadPlan{}, fmt.Errorf("invalid worker command")
	}
	if dbPass == "" || strings.ContainsAny(dbPass, "\r\n") {
		return WorkloadPlan{}, fmt.Errorf("invalid database password")
	}

	name := safeAppName(app.Name)
	apiName := "aetherhost-" + name + "-api"
	workerName := "aetherhost-" + name + "-worker"
	pgName := "aetherhost-" + name + "-postgres"
	redisName := "aetherhost-" + name + "-redis"

	var b strings.Builder
	b.WriteString("services:\n")
	writeAPI(&b, apiName, image, name, port, app.WithPostgres, app.WithRedis, pgName, redisName)
	if worker != "" {
		writeWorker(&b, workerName, image, app.WithPostgres, app.WithRedis, pgName, redisName)
	}
	if app.WithPostgres {
		writePostgres(&b, pgName)
	}
	if app.WithRedis {
		writeRedis(&b, redisName)
	}
	b.WriteString("\nnetworks:\n")
	b.WriteString("  aetherhost-net:\n    external: true\n")
	b.WriteString("  private:\n")
	if app.WithPostgres || app.WithRedis {
		b.WriteString("\nvolumes:\n")
		if app.WithPostgres {
			b.WriteString("  pgdata:\n")
		}
		if app.WithRedis {
			b.WriteString("  redisdata:\n")
		}
	}

	appEnv, err := buildAppEnv(app, dbPass, pgName, redisName, worker)
	if err != nil {
		return WorkloadPlan{}, err
	}
	pgEnv := ""
	if app.WithPostgres {
		pgEnv = fmt.Sprintf("POSTGRES_USER=app\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=app\n", dbPass)
	}
	return WorkloadPlan{
		Compose:     b.String(),
		AppEnv:      appEnv,
		PostgresEnv: pgEnv,
		Alias:       apiName,
		Port:        port,
		HealthPath:  healthPath,
	}, nil
}

func writeAPI(b *strings.Builder, apiName, image, host string, port int, withPostgres, withRedis bool, pgName, redisName string) {
	fmt.Fprintf(b, "  %s:\n", apiName)
	fmt.Fprintf(b, "    image: %s\n", image)
	fmt.Fprintf(b, "    container_name: %s\n", apiName)
	b.WriteString("    env_file:\n      - workload.env\n")
	b.WriteString("    init: true\n")
	b.WriteString("    stop_grace_period: 30s\n")
	b.WriteString("    mem_limit: 512m\n")
	b.WriteString("    restart: unless-stopped\n")
	b.WriteString("    labels:\n")
	b.WriteString("      - \"traefik.enable=true\"\n")
	b.WriteString("      - \"traefik.docker.network=aetherhost-net\"\n")
	fmt.Fprintf(b, "      - \"traefik.http.routers.%s-app.rule=Host(`%s.localhost`)\"\n", host, host)
	fmt.Fprintf(b, "      - \"traefik.http.services.%s-app.loadbalancer.server.port=%d\"\n", host, port)
	b.WriteString("    networks:\n")
	b.WriteString("      private: {}\n")
	b.WriteString("      aetherhost-net:\n")
	fmt.Fprintf(b, "        aliases:\n          - %s\n", apiName)
	if withPostgres || withRedis {
		b.WriteString("    depends_on:\n")
		if withPostgres {
			fmt.Fprintf(b, "      %s:\n        condition: service_healthy\n", pgName)
		}
		if withRedis {
			fmt.Fprintf(b, "      %s:\n        condition: service_healthy\n", redisName)
		}
	}
}

func writeWorker(b *strings.Builder, workerName, image string, withPostgres, withRedis bool, pgName, redisName string) {
	fmt.Fprintf(b, "  %s:\n", workerName)
	fmt.Fprintf(b, "    image: %s\n", image)
	fmt.Fprintf(b, "    container_name: %s\n", workerName)
	b.WriteString("    env_file:\n      - workload.env\n")
	b.WriteString("    entrypoint: [\"sh\", \"-c\"]\n")
	b.WriteString("    command: ['exec sh -c \"$$AETHERHOST_WORKER_COMMAND\"']\n")
	b.WriteString("    init: true\n")
	b.WriteString("    stop_grace_period: 30s\n")
	b.WriteString("    mem_limit: 512m\n")
	b.WriteString("    restart: unless-stopped\n")
	b.WriteString("    networks:\n")
	b.WriteString("      private: {}\n")
	if withPostgres || withRedis {
		b.WriteString("    depends_on:\n")
		if withPostgres {
			fmt.Fprintf(b, "      %s:\n        condition: service_healthy\n", pgName)
		}
		if withRedis {
			fmt.Fprintf(b, "      %s:\n        condition: service_healthy\n", redisName)
		}
	}
}

func writePostgres(b *strings.Builder, pgName string) {
	fmt.Fprintf(b, "  %s:\n", pgName)
	b.WriteString("    image: postgres:16-alpine\n")
	fmt.Fprintf(b, "    container_name: %s\n", pgName)
	b.WriteString("    env_file:\n      - postgres.env\n")
	b.WriteString("    volumes:\n      - pgdata:/var/lib/postgresql/data\n")
	b.WriteString("    mem_limit: 256m\n")
	b.WriteString("    restart: unless-stopped\n")
	b.WriteString("    networks:\n")
	b.WriteString("      private:\n")
	fmt.Fprintf(b, "        aliases:\n          - %s\n", pgName)
	b.WriteString("    healthcheck:\n")
	b.WriteString("      test: [\"CMD-SHELL\", \"pg_isready -U app -d app\"]\n")
	b.WriteString("      interval: 5s\n")
	b.WriteString("      timeout: 3s\n")
	b.WriteString("      retries: 20\n")
}

func writeRedis(b *strings.Builder, redisName string) {
	fmt.Fprintf(b, "  %s:\n", redisName)
	b.WriteString("    image: redis:7-alpine\n")
	fmt.Fprintf(b, "    container_name: %s\n", redisName)
	b.WriteString("    command: [\"redis-server\", \"--appendonly\", \"yes\"]\n")
	b.WriteString("    volumes:\n      - redisdata:/data\n")
	b.WriteString("    mem_limit: 128m\n")
	b.WriteString("    restart: unless-stopped\n")
	b.WriteString("    networks:\n")
	b.WriteString("      private:\n")
	fmt.Fprintf(b, "        aliases:\n          - %s\n", redisName)
	b.WriteString("    healthcheck:\n")
	b.WriteString("      test: [\"CMD\", \"redis-cli\", \"ping\"]\n")
	b.WriteString("      interval: 5s\n")
	b.WriteString("      timeout: 3s\n")
	b.WriteString("      retries: 20\n")
}

func buildAppEnv(app Application, dbPass, pgName, redisName, worker string) (string, error) {
	var b strings.Builder
	for key, value := range app.EnvVars {
		if isReservedEnv(key) {
			return "", fmt.Errorf("reserved env %s", key)
		}
		if !envKeyPattern.MatchString(key) {
			return "", fmt.Errorf("invalid env key")
		}
		if len(value) > 500 || strings.ContainsAny(value, "\r\n\x00") {
			return "", fmt.Errorf("invalid env value")
		}
		fmt.Fprintf(&b, "%s=%s\n", key, value)
	}
	if app.WithPostgres {
		fmt.Fprintf(&b, "DATABASE_URL=postgresql://app:%s@%s:5432/app\n", dbPass, pgName)
	}
	if app.WithRedis {
		fmt.Fprintf(&b, "REDIS_URL=redis://%s:6379\n", redisName)
	}
	if worker != "" {
		fmt.Fprintf(&b, "AETHERHOST_WORKER_COMMAND=%s\n", worker)
	}
	return b.String(), nil
}
