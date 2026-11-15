package main

import "testing"

func TestDetectAppPortIgnoresTenantCompose(t *testing.T) {
	app := Application{
		Port:          3000,
		DockerCompose: "services:\n  app:\n    labels:\n      - traefik.http.services.app.loadbalancer.server.port=4444\n    privileged: true\n",
	}

	if got := detectAppPort(app, t.TempDir()); got != 3000 {
		t.Fatalf("detectAppPort() = %d, want contract port 3000", got)
	}
}
