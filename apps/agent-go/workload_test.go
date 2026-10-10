package main

import (
	"strings"
	"testing"
)

func signaldeskApp() Application {
	return Application{
		Name:          "Signaldesk",
		Runtime:       "nodejs",
		DockerImage:   "ghcr.io/acme/signaldesk:1.4.0",
		WorkerCommand: "node dist/worker.js",
		WithPostgres:  true,
		WithRedis:     true,
		Port:          3000,
		HealthPath:    "/health",
		EnvVars:       map[string]string{"NODE_ENV": "production"},
	}
}

func serviceBlock(t *testing.T, compose, name string) string {
	t.Helper()
	token := "  " + name + ":\n"
	start := strings.Index(compose, token)
	if start < 0 {
		t.Fatalf("missing service %s", name)
	}
	rest := compose[start+len(token):]
	end := len(rest)
	for _, marker := range []string{"\n  aetherhost-", "\nvolumes:\n", "\nnetworks:\n"} {
		if i := strings.Index(rest, marker); i >= 0 && i < end {
			end = i
		}
	}
	return rest[:end]
}

func TestSignaldeskWorkload(t *testing.T) {
	app := signaldeskApp()
	if !isWorkload(app) {
		t.Fatal("expected an image deploy to be a workload")
	}
	plan, err := buildWorkload(app, "DbPass1234567890")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(plan.Compose, "traefik.enable=true") != 1 {
		t.Fatal("traefik must attach only to the api")
	}
	if strings.Contains(plan.Compose, "code-server") || strings.Contains(plan.Compose, "privileged:") || strings.Contains(plan.Compose, "docker.sock") || strings.Contains(plan.Compose, "ports:") {
		t.Fatal("workload compose published a host port or an unsafe option")
	}
	if strings.Contains(plan.Compose, "DbPass1234567890") || strings.Contains(plan.Compose, "node dist/worker.js") {
		t.Fatal("secrets or the worker command leaked into the compose file")
	}
	if !strings.Contains(plan.Compose, "$$AETHERHOST_WORKER_COMMAND") {
		t.Fatal("worker must expand its command inside the container")
	}
	if !strings.Contains(plan.Compose, "init: true") || !strings.Contains(plan.Compose, "stop_grace_period: 30s") {
		t.Fatal("api and worker must get an init process and a stop grace period")
	}
	if !strings.Contains(plan.Compose, "Host(`signaldesk.localhost`)") || !strings.Contains(plan.Compose, "server.port=3000") {
		t.Fatal("traefik route was not rendered")
	}

	api := serviceBlock(t, plan.Compose, "aetherhost-signaldesk-api")
	worker := serviceBlock(t, plan.Compose, "aetherhost-signaldesk-worker")
	postgres := serviceBlock(t, plan.Compose, "aetherhost-signaldesk-postgres")
	redis := serviceBlock(t, plan.Compose, "aetherhost-signaldesk-redis")
	if !strings.Contains(api, "aetherhost-net") || !strings.Contains(api, "private:") {
		t.Fatal("api must join ingress and the private network")
	}
	if strings.Contains(worker, "aetherhost-net") || strings.Contains(postgres, "aetherhost-net") || strings.Contains(redis, "aetherhost-net") {
		t.Fatal("worker and datastores must stay off the shared ingress network")
	}
	if !strings.Contains(plan.AppEnv, "NODE_ENV=production") {
		t.Fatal("tenant env was dropped")
	}
	if !strings.Contains(plan.AppEnv, "DATABASE_URL=postgresql://app:DbPass1234567890@aetherhost-signaldesk-postgres:5432/app") {
		t.Fatal("database url was not injected")
	}
	if !strings.Contains(plan.AppEnv, "REDIS_URL=redis://aetherhost-signaldesk-redis:6379") {
		t.Fatal("redis url was not injected")
	}
	if !strings.Contains(plan.AppEnv, "AETHERHOST_WORKER_COMMAND=node dist/worker.js") {
		t.Fatal("worker command was not injected")
	}
	if !strings.Contains(plan.PostgresEnv, "POSTGRES_PASSWORD=DbPass1234567890") {
		t.Fatal("postgres env was not written")
	}
	if plan.Alias != "aetherhost-signaldesk-api" || plan.HealthPath != "/health" {
		t.Fatal("probe target was wrong")
	}
}

func TestWorkloadRejectsUnsafeSpec(t *testing.T) {
	app := signaldeskApp()
	app.DockerImage = "ghcr.io/acme/../signaldesk:1"
	if _, err := buildWorkload(app, "DbPass1234567890"); err == nil {
		t.Fatal("expected a path-traversal image to be rejected")
	}
	app = signaldeskApp()
	app.WorkerCommand = "node dist/worker.js; curl evil"
	if _, err := buildWorkload(app, "DbPass1234567890"); err == nil {
		t.Fatal("expected a shell worker command to be rejected")
	}
	app = signaldeskApp()
	app.EnvVars = map[string]string{"DATABASE_URL": "postgresql://evil@control-plane/aetherhost"}
	if _, err := buildWorkload(app, "DbPass1234567890"); err == nil {
		t.Fatal("expected a reserved env key to be rejected")
	}
	app = signaldeskApp()
	app.Runtime = "wordpress"
	if isWorkload(app) {
		t.Fatal("wordpress must stay on its own runtime path")
	}
}

func TestSafeAppName(t *testing.T) {
	if safeAppName("Signaldesk") != "signaldesk" {
		t.Fatal(safeAppName("Signaldesk"))
	}
	if safeAppName("My App") != "my-app" {
		t.Fatal(safeAppName("My App"))
	}
	if safeAppName("../shared/deployment") != "shared-deployment" {
		t.Fatal(safeAppName("../shared/deployment"))
	}
}

func TestValidCustomDomain(t *testing.T) {
	if !validCustomDomain("app.example.com") {
		t.Fatal("expected a valid custom domain")
	}
	if validCustomDomain("bad domain.example.com") {
		t.Fatal("expected invalid hostname to be rejected")
	}
	if validCustomDomain("signaldesk.localhost") {
		t.Fatal("expected platform hostname to be rejected")
	}
}
