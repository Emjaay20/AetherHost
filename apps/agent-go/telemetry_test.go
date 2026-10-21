package main

import "testing"

func TestAppNameFromContainer(t *testing.T) {
	cases := map[string]string{
		"aetherhost-smart-crawler-app-1": "smart-crawler",
		"gadgetsgarden-app-1":            "gadgetsgarden",
		"aetherhost-wp-db-1":             "wp",
	}
	for in, want := range cases {
		got, ok := appNameFromContainer(in)
		if !ok || got != want {
			t.Errorf("%s: got %q ok=%v want %q", in, got, ok, want)
		}
	}
	for _, in := range []string{"aetherhost-api", "aetherhost-traefik", "aetherhost-docker-proxy", "buildx_buildkit_default"} {
		if _, ok := appNameFromContainer(in); ok {
			t.Errorf("%s should be ignored", in)
		}
	}
	if got := parseDockerSize("1.5MB"); got != 1.5e6 {
		t.Errorf("parseDockerSize = %v", got)
	}
}
