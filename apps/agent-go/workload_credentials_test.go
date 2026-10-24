package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkloadCredentialsPersistAcrossRedeploys(t *testing.T) {
	dir := t.TempDir()
	first, err := workloadCredentialsFor(dir)
	if err != nil {
		t.Fatal(err)
	}
	second, err := workloadCredentialsFor(dir)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatalf("credentials changed across redeploy: %#v != %#v", first, second)
	}
	info, err := os.Stat(filepath.Join(dir, workloadCredentialsFile))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0600 {
		t.Fatalf("credential file permissions = %o, want 600", info.Mode().Perm())
	}
}
