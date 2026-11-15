package main

import (
	"strings"
	"testing"
)

func TestPersistentAppDataOptInAndIdentity(t *testing.T) {
	app := Application{ID: "app-one", Name: "Crawler", Runtime: "github", GithubRepo: "https://github.com/example/crawler", EnvVars: map[string]string{}}
	initial := renderRuntimeCompose(app, "crawler", "/control", "/projects", "example.com")
	if strings.Contains(initial, "appdata") {
		t.Fatal("storage must be opt in")
	}
	app.EnvVars["AETHER_PERSIST_APP_DATA"] = "true"
	configured := renderRuntimeCompose(app, "crawler", "/control", "/projects", "example.com")
	if !strings.Contains(configured, "appdata:/app/data") || !strings.Contains(configured, "name: aetherhost-data-") {
		t.Fatal("missing durable named volume")
	}
	_, before := persistentAppDataCompose(app)
	app.Name = "Renamed"
	_, after := persistentAppDataCompose(app)
	if before != after {
		t.Fatal("renaming must preserve volume identity")
	}
	app.ID = "app-two"
	_, other := persistentAppDataCompose(app)
	if before == other {
		t.Fatal("applications must not share data volumes")
	}
	app.ID = ""
	mount, _ := persistentAppDataCompose(app)
	if mount != "" {
		t.Fatal("missing identity must not allocate shared storage")
	}
}
