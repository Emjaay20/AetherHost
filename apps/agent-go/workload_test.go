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
		WithMariaDb:   true,
		WithRedis:     true,
		Port:          3000,
		HealthPath:    "/health",
		EnvVars:       map[string]string{"NODE_ENV": "production"},
	}
}

func serviceBlock(t *testing.T, compose, name string) string {
	t.Helper()
	token := "\n  " + name + ":\n"
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
	plan, err := buildWorkload(app, "PostgresPass123", "MariaDbPass123", "RedisPass123")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(plan.Compose, "traefik.enable=true") != 1 {
		t.Fatal("traefik must attach only to the api")
	}
	if strings.Contains(plan.Compose, "code-server") || strings.Contains(plan.Compose, "privileged:") || strings.Contains(plan.Compose, "docker.sock") || strings.Contains(plan.Compose, "ports:") {
		t.Fatal("workload compose published a host port or an unsafe option")
	}
	if strings.Contains(plan.Compose, "PostgresPass123") || strings.Contains(plan.Compose, "MariaDbPass123") || strings.Contains(plan.Compose, "RedisPass123") || strings.Contains(plan.Compose, "node dist/worker.js") {
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
	mariadb := serviceBlock(t, plan.Compose, "aetherhost-signaldesk-mariadb")
	redis := serviceBlock(t, plan.Compose, "aetherhost-signaldesk-redis")
	if !strings.Contains(api, "aetherhost-net") || !strings.Contains(api, "private:") {
		t.Fatal("api must join ingress and the private network")
	}
	if strings.Contains(worker, "aetherhost-net") || strings.Contains(postgres, "aetherhost-net") || strings.Contains(mariadb, "aetherhost-net") || strings.Contains(redis, "aetherhost-net") {
		t.Fatal("worker and datastores must stay off the shared ingress network")
	}
	if !strings.Contains(plan.AppEnv, "NODE_ENV=production") {
		t.Fatal("tenant env was dropped")
	}
	if !strings.Contains(plan.AppEnv, "DATABASE_URL=postgresql://app:PostgresPass123@aetherhost-signaldesk-postgres:5432/app") {
		t.Fatal("database url was not injected")
	}
	if !strings.Contains(plan.AppEnv, "MYSQL_URL=mysql://app:MariaDbPass123@aetherhost-signaldesk-mariadb:3306/app") {
		t.Fatal("MariaDB url was not injected")
	}
	if !strings.Contains(plan.AppEnv, "REDIS_URL=redis://:RedisPass123@aetherhost-signaldesk-redis:6379") {
		t.Fatal("redis url was not injected")
	}
	if !strings.Contains(plan.AppEnv, "AETHERHOST_WORKER_COMMAND=node dist/worker.js") {
		t.Fatal("worker command was not injected")
	}
	if !strings.Contains(plan.PostgresEnv, "POSTGRES_PASSWORD=PostgresPass123") || !strings.Contains(plan.MariaDbEnv, "MARIADB_PASSWORD=MariaDbPass123") || !strings.Contains(plan.RedisEnv, "REDIS_PASSWORD=RedisPass123") {
		t.Fatal("postgres env was not written")
	}
	if !strings.Contains(api, "cap_drop:") || !strings.Contains(api, "no-new-privileges:true") || !strings.Contains(plan.Compose, "--requirepass") {
		t.Fatalf("workload hardening defaults were not rendered (api caps=%t, api no-new-privileges=%t, redis auth=%t)", strings.Contains(api, "cap_drop:"), strings.Contains(api, "no-new-privileges:true"), strings.Contains(plan.Compose, "--requirepass"))
	}
	if plan.Alias != "aetherhost-signaldesk-api" || plan.HealthPath != "/health" {
		t.Fatal("probe target was wrong")
	}
}

func TestWorkloadIdentitySeparatesRuntimeResourcesFromPublicHostname(t *testing.T) {
	app := signaldeskApp()
	app.ID = "app_smartcrawl-id_3dd62017"
	identity := workloadDeploymentName(app)
	if identity != "app-smartcrawl-id-3dd62017" {
		t.Fatalf("unexpected workload identity: %s", identity)
	}

	plan, err := buildWorkloadWithIdentity(app, identity, "PostgresPass123", "MariaDbPass123", "RedisPass123")
	if err != nil {
		t.Fatal(err)
	}
	if plan.Alias != "aetherhost-app-smartcrawl-id-3dd62017-api" {
		t.Fatalf("workload alias used a display name: %s", plan.Alias)
	}
	if !strings.Contains(plan.Compose, "aetherhost-app-smartcrawl-id-3dd62017_pgdata") && !strings.Contains(plan.Compose, "aetherhost-app-smartcrawl-id-3dd62017-postgres") {
		t.Fatal("workload resources were not based on the immutable application identity")
	}
	if !strings.Contains(plan.Compose, "Host(`signaldesk.localhost`)") {
		t.Fatal("public hostname must continue to use the display name")
	}
	if !strings.Contains(plan.Compose, "traefik.http.routers.app-smartcrawl-id-3dd62017-app") {
		t.Fatal("traefik router identity must be unique per workload")
	}
}

func TestWorkloadRejectsUnsafeSpec(t *testing.T) {
	app := signaldeskApp()
	app.DockerImage = "ghcr.io/acme/../signaldesk:1"
	if _, err := buildWorkload(app, "PostgresPass123", "MariaDbPass123", "RedisPass123"); err == nil {
		t.Fatal("expected a path-traversal image to be rejected")
	}
	app = signaldeskApp()
	app.WorkerCommand = "node dist/worker.js; curl evil"
	if _, err := buildWorkload(app, "PostgresPass123", "MariaDbPass123", "RedisPass123"); err == nil {
		t.Fatal("expected a shell worker command to be rejected")
	}
	app = signaldeskApp()
	app.EnvVars = map[string]string{"DATABASE_URL": "postgresql://evil@control-plane/aetherhost"}
	if _, err := buildWorkload(app, "PostgresPass123", "MariaDbPass123", "RedisPass123"); err == nil {
		t.Fatal("expected a reserved env key to be rejected")
	}
	app = signaldeskApp()
	app.Runtime = "wordpress"
	app.DockerImage = ""
	if !isWorkload(app) {
		t.Fatal("wordpress must use the workload contract")
	}
}

func TestWordPressUsesContractProfileAndLegacyVolumes(t *testing.T) {
	app := Application{
		ID:               "app_legacy_blog_12345678",
		Name:             "Legacy Blog",
		Runtime:          "wordpress",
		CustomDomain:     "blog.example.com",
		WorkloadMemoryMB: 1024,
	}
	identity := workloadDeploymentName(app)
	if identity != "legacy-blog" {
		t.Fatalf("wordpress must retain its legacy name-based identity, got %q", identity)
	}
	plan, err := buildWorkloadWithIdentity(app, identity, "PostgresPass123", "MariaDbPass123", "RedisPass123")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(plan.Compose, "traefik.enable=true") != 1 {
		t.Fatal("only nginx may be attached to Traefik")
	}
	nginx := serviceBlock(t, plan.Compose, "aetherhost-legacy-blog-nginx")
	php := serviceBlock(t, plan.Compose, "aetherhost-legacy-blog-php")
	mariadb := serviceBlock(t, plan.Compose, "aetherhost-legacy-blog-mariadb")
	redis := serviceBlock(t, plan.Compose, "aetherhost-legacy-blog-redis")
	if !strings.Contains(nginx, "aetherhost-net") || !strings.Contains(nginx, "private:") {
		t.Fatal("nginx must join ingress and private networks")
	}
	for name, service := range map[string]string{"php": php, "mariadb": mariadb, "redis": redis} {
		if strings.Contains(service, "aetherhost-net") || !strings.Contains(service, "private:") {
			t.Fatalf("%s must remain private: %s", name, service)
		}
		if !strings.Contains(service, "mem_limit:") || !strings.Contains(service, "init: true") || !strings.Contains(service, "stop_grace_period: 30s") {
			t.Fatalf("%s missed the workload lifecycle controls", name)
		}
	}
	if strings.Contains(plan.Compose, "MariaDbPass123") || strings.Contains(plan.Compose, "RedisPass123") {
		t.Fatal("wordpress credentials leaked into compose")
	}
	if !strings.Contains(plan.WordPressEnv, "WORDPRESS_DB_PASSWORD=MariaDbPass123") || !strings.Contains(plan.WordPressEnv, "WP_REDIS_HOST") {
		t.Fatal("wordpress database and Redis configuration was not generated in a protected env file")
	}
	if !strings.Contains(plan.Compose, "name: aetherhost-legacy-blog_wordpress_data") || !strings.Contains(plan.Compose, "name: aetherhost-legacy-blog_db_data") {
		t.Fatal("legacy WordPress volume names were not preserved")
	}
	if plan.Alias != "aetherhost-legacy-blog-nginx" || plan.Port != 80 || plan.HealthPath != "/.aetherhost/ready" {
		t.Fatalf("wordpress must be health-checked through nginx, got %+v", plan)
	}
	for _, path := range []string{"wordpress-nginx.conf", "wordpress-php-fpm.conf", "wordpress-mariadb.cnf"} {
		if plan.ConfigFiles[path] == "" {
			t.Fatalf("missing generated config %s", path)
		}
	}
}

func TestWordPressTuningScalesWithBudgetAndStaysBounded(t *testing.T) {
	smallResources, err := wordpressResources(1024)
	if err != nil {
		t.Fatal(err)
	}
	largeResources, err := wordpressResources(1536)
	if err != nil {
		t.Fatal(err)
	}
	small, err := deriveWordPressTuning(smallResources)
	if err != nil {
		t.Fatal(err)
	}
	large, err := deriveWordPressTuning(largeResources)
	if err != nil {
		t.Fatal(err)
	}
	if large.PHPMaxChildren < small.PHPMaxChildren || large.MariaBufferMB < small.MariaBufferMB || large.MariaMaxConns < small.MariaMaxConns {
		t.Fatalf("larger budget did not scale tuning: small=%+v large=%+v", small, large)
	}
	for name, profile := range map[string]struct {
		resources WordPressResources
		tuning    WordPressTuning
	}{
		"small": {smallResources, small},
		"large": {largeResources, large},
	} {
		resources, tuning := profile.resources, profile.tuning
		phpWorstCase := tuning.OPcacheMB + phpFixedReserveMB + tuning.PHPMaxChildren*(tuning.PHPMemoryMB+phpWorkerBudgetMB)
		if phpWorstCase > resources.PHPMB {
			t.Fatalf("%s php budget can exceed limit: %d > %d", name, phpWorstCase, resources.PHPMB)
		}
		dbWorstCase := tuning.MariaBufferMB + databaseFixedReserveMB + tuning.MariaMaxConns*databaseConnectionBudget
		if dbWorstCase > resources.MariaMB {
			t.Fatalf("%s database budget can exceed limit: %d > %d", name, dbWorstCase, resources.MariaMB)
		}
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
