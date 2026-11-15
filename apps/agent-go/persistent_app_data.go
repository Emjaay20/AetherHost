package main

import (
	"crypto/sha256"
	"fmt"
)

// Opt-in, fixed-target storage: tenants cannot choose a host path or volume name.
// The immutable application ID prevents display-name changes from losing data.
func persistentAppDataCompose(app Application) (string, string) {
	if app.EnvVars["AETHER_PERSIST_APP_DATA"] != "true" || app.ID == "" {
		return "", ""
	}
	name := fmt.Sprintf("aetherhost-data-%x", sha256.Sum256([]byte(app.ID)))
	return "    volumes:\n      - appdata:/app/data\n", fmt.Sprintf("volumes:\n  appdata:\n    name: %s\n", name)
}
