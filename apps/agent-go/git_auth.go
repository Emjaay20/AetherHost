package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

// gitAuthEnv returns environment variables that configure Git HTTP authentication
// via GIT_CONFIG_* headers so that OAuth tokens are never embedded in repository URLs
// or exposed in process arguments / error messages.
func gitAuthEnv(githubToken string) []string {
	env := append([]string{}, os.Environ()...)
	env = append(env, "GIT_TERMINAL_PROMPT=0")
	if strings.TrimSpace(githubToken) == "" {
		return env
	}
	basic := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + githubToken))
	env = append(
		env,
		"GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=http.https://github.com/.extraheader",
		fmt.Sprintf("GIT_CONFIG_VALUE_0=Authorization: Basic %s", basic),
	)
	return env
}

// runGitWithToken executes a git command with optional GitHub token authentication
// injected via environment headers rather than URL embedding, and redacts any token
// from combined output.
func runGitWithToken(githubToken string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Env = gitAuthEnv(githubToken)
	out, err := cmd.CombinedOutput()
	sanitized := redactSecrets(string(out), githubToken)
	return sanitized, err
}

// redactSecrets scrubs a secret token (and its base64 basic auth form) from logs/output.
func redactSecrets(text, secret string) string {
	if strings.TrimSpace(secret) == "" || text == "" {
		return text
	}
	redacted := strings.ReplaceAll(text, secret, "[REDACTED]")
	basic := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + secret))
	redacted = strings.ReplaceAll(redacted, basic, "[REDACTED]")
	return redacted
}
