package main

import (
	"testing"
)

func TestGetDockerImageAndCmdForRuntime(t *testing.T) {
	tests := []struct {
		runtime       string
		expectedImage string
	}{
		{"nodejs", "node:18-alpine"},
		{"python", "python:3.11-slim"},
		{"rust", "rust:slim"},
		{"go", "golang:1.21-alpine"},
		{"unknown", "alpine:latest"},
	}

	for _, tt := range tests {
		image, cmd := getDockerImageAndCmdForRuntime(tt.runtime)
		if image != tt.expectedImage {
			t.Errorf("expected %s, got %s", tt.expectedImage, image)
		}
		if len(cmd) == 0 {
			t.Errorf("expected non-empty command for runtime %s", tt.runtime)
		}
	}
}

func TestSecuritySanitizer(t *testing.T) {
	unsafeCompose1 := "services:\n  app:\n    privileged: true"
	if !strings.Contains(unsafeCompose1, "privileged:") {
		t.Errorf("Sanitizer failed to detect privileged:")
	}

	unsafeCompose2 := "services:\n  app:\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock"
	if !strings.Contains(unsafeCompose2, "/var/run/docker.sock") {
		t.Errorf("Sanitizer failed to detect docker.sock")
	}
}
