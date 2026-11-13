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

func TestWorkloadCredentialsMigrateLegacyWordPressDatabasePassword(t *testing.T) {
	dir := t.TempDir()
	legacyPassword := "LegacyWordPressDbPassword123"
	legacyCompose := "services:\n  php:\n    environment:\n      WORDPRESS_DB_PASSWORD: " + legacyPassword + "\n"
	if err := os.WriteFile(filepath.Join(dir, "docker-compose.yml"), []byte(legacyCompose), 0644); err != nil {
		t.Fatal(err)
	}
	credentials, err := workloadCredentialsFor(dir)
	if err != nil {
		t.Fatal(err)
	}
	if credentials.MariaDbPassword != legacyPassword {
		t.Fatalf("legacy WordPress password was not preserved")
	}
	if _, err := os.Stat(filepath.Join(dir, workloadCredentialsFile)); err != nil {
		t.Fatal("protected credential record was not created")
	}
}
