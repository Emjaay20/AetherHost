package main

import (
	"strings"
	"testing"
)

// PROJECTS_ROOT is the directory that holds each app's checkout directly
// (for example /srv/aetherhost/projects/<app>). Mounting
// <projects>/deployments/<app> gives the container an empty directory, so
// `npm start` fails with "Could not read package.json".
func TestRuntimeComposeMountsAppCheckoutUnderProjectsRoot(t *testing.T) {
	for _, runtime := range []string{"nodejs", "python", "go", "rust"} {
		app := Application{ID: "app-1", Name: "demo", Runtime: runtime}
		compose := renderRuntimeCompose(app, "demo", "/control", "/srv/aetherhost/projects", "example.com")
		if !strings.Contains(compose, "- /srv/aetherhost/projects/demo:/app\n") {
			t.Fatalf("%s: app checkout not mounted from projects root:\n%s", runtime, compose)
		}
		if strings.Contains(compose, "/projects/deployments/") {
			t.Fatalf("%s: mount points at a non-existent deployments subdirectory:\n%s", runtime, compose)
		}
	}
}
