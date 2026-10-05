package main

import (
	"strings"
	"testing"
)

func TestRuntimeSpec(t *testing.T) {
	tests := []struct {
		runtime       string
		expectedImage string
	}{
		{"nodejs", "node:18-alpine"},
		{"python", "python:3.11-slim"},
		{"unknown", "alpine:latest"},
	}

	for _, tt := range tests {
		image, cmd := runtimeSpec(tt.runtime)
		if image != tt.expectedImage {
			t.Errorf("expected %s, got %s", tt.expectedImage, image)
		}
		if cmd == "" {
			t.Errorf("expected non-empty command for runtime %s", tt.runtime)
		}
	}
}

func TestRejectTenantCompose(t *testing.T) {
	if !rejectTenantCompose("services:\n  app:\n    privileged: true") {
		t.Fatal("expected privileged compose to be rejected")
	}
	if !rejectTenantCompose("volumes:\n  - /var/run/docker.sock:/var/run/docker.sock") {
		t.Fatal("expected docker.sock compose to be rejected")
	}
	if rejectTenantCompose("services:\n  app:\n    image: nginx:alpine") {
		t.Fatal("expected a normal compose file to be allowed")
	}
}

func TestWordPressHealthPaths(t *testing.T) {
	if !strings.Contains(wordpressHealthURL, "/fpm-ping") {
		t.Fatal("wordpress health check must hit PHP-FPM")
	}
}
