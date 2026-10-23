package main

import (
	"net/http"
	"net/http/httptest"
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

func TestRandomPassword(t *testing.T) {
	p1 := randomPassword()
	p2 := randomPassword()
	if len(p1) != 16 || len(p2) != 16 {
		t.Fatalf("expected 16-char passwords, got %d and %d", len(p1), len(p2))
	}
	if p1 == p2 {
		t.Fatal("expected cryptographically random passwords to differ")
	}
}

func TestGitAuthEnvAndRedaction(t *testing.T) {
	token := "test-token-not-a-secret"
	env := gitAuthEnv(token)
	foundHeader := false
	for _, entry := range env {
		if strings.HasPrefix(entry, "GIT_CONFIG_VALUE_0=Authorization: Basic ") {
			foundHeader = true
			if strings.Contains(entry, token) {
				t.Fatal("raw token should be base64-encoded, not plaintext in header")
			}
		}
	}
	if !foundHeader {
		t.Fatal("expected GIT_CONFIG_VALUE_0 auth header in environment")
	}

	leakedOutput := "fatal: unable to access https://test-token-not-a-secret@github.com/org/repo.git"
	redacted := redactSecrets(leakedOutput, token)
	if strings.Contains(redacted, token) {
		t.Fatalf("expected token to be redacted, got: %s", redacted)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestFetchApplicationsByStatusChecksHTTPStatus(t *testing.T) {
	origTransport := httpClient.Transport
	defer func() { httpClient.Transport = origTransport }()

	httpClient.Transport = roundTripFunc(func(r *http.Request) (*http.Response, error) {
		rec := httptest.NewRecorder()
		if r.URL.Query().Get("status") == "error" {
			rec.WriteHeader(http.StatusInternalServerError)
			_, _ = rec.WriteString(`{"message":"Internal server error"}`)
		} else {
			rec.WriteHeader(http.StatusOK)
			_, _ = rec.WriteString(`[{"id":"app_1","name":"demo","runtime":"go","status":"pending"}]`)
		}
		return rec.Result(), nil
	})

	if _, err := fetchApplicationsByStatus("http://control-plane.local", "error"); err == nil {
		t.Fatal("expected error on HTTP 500 response")
	}

	apps, err := fetchApplicationsByStatus("http://control-plane.local", "pending")
	if err != nil {
		t.Fatalf("unexpected error on HTTP 200 response: %v", err)
	}
	if len(apps) != 1 || apps[0].ID != "app_1" {
		t.Fatalf("unexpected apps result: %+v", apps)
	}
}
