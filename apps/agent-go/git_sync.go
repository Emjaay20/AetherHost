package main

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func syncApplicationRepo(app Application, appDir, safeName string, appLog *slog.Logger, controlPlaneURL string) error {
	gitDir := filepath.Join(appDir, ".git")
	nowStr := func() string { return time.Now().Format("15:04:05") }

	// 1. Fast sync if valid git repository already exists
	if _, err := os.Stat(gitDir); err == nil {
		appLog.Info("syncing existing git repository", slog.String("repo", app.GithubRepo), slog.String("dir", appDir))
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Syncing latest commits from GitHub...", nowStr()))

		// Set remote origin URL (in case token or repo URL changed)
		_ = exec.Command("git", "-C", appDir, "remote", "set-url", "origin", app.GithubRepo).Run()

		// Fetch all branches/tags from origin
		out, err := runGitWithToken(app.GithubToken, "-C", appDir, "fetch", "--prune", "origin")
		if err == nil {
			// Find default branch to reset to
			targetBranch := "origin/main"
			if exec.Command("git", "-C", appDir, "rev-parse", "--verify", "origin/main").Run() != nil {
				if exec.Command("git", "-C", appDir, "rev-parse", "--verify", "origin/master").Run() == nil {
					targetBranch = "origin/master"
				} else {
					targetBranch = "FETCH_HEAD"
				}
			}

			// Hard reset to remote HEAD
			_ = exec.Command("git", "-C", appDir, "reset", "--hard", targetBranch).Run()
			// Clean untracked files while preserving .env
			_ = exec.Command("git", "-C", appDir, "clean", "-fdx", "--exclude=.env").Run()

			// Check what commit was synced
			commitOut, _ := exec.Command("git", "-C", appDir, "log", "-1", "--format=%h: %s (%an)").Output()
			commitMsg := strings.TrimSpace(string(commitOut))
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Synchronized to latest commit: %s", nowStr(), commitMsg))
			writeEnvFile(app, appDir)
			return nil
		}

		appLog.Warn("git fetch failed; attempting clean re-clone", slog.String("output", out))
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Fast git sync encountered issue; performing clean checkout...", nowStr()))
	}

	// 2. If no .git exists or fast sync failed, tear down any running containers to release file locks
	composeFile := filepath.Join(appDir, "docker-compose.yml")
	if _, err := os.Stat(composeFile); err == nil {
		_ = exec.Command("docker", "compose", "-f", composeFile, "-p", "aetherhost-"+safeName, "down").Run()
	}

	// Clean directory
	_ = os.RemoveAll(appDir)
	_ = exec.Command("rm", "-rf", appDir).Run()
	_ = os.MkdirAll(appDir, 0755)

	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cloning repository: %s", nowStr(), app.GithubRepo))
	appLog.Info("cloning github repository", slog.String("repo", app.GithubRepo))

	out, err := runGitWithToken(app.GithubToken, "clone", "--depth", "1", app.GithubRepo, appDir)
	if err != nil {
		errMsg := fmt.Sprintf("git clone failed: %s", out)
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Git clone failed: %s", nowStr(), out))
		appLog.Error("git clone failed", slog.String("output", out), slog.String("error", err.Error()))
		return fmt.Errorf("%s", errMsg)
	}

	commitOut, _ := exec.Command("git", "-C", appDir, "log", "-1", "--format=%h: %s (%an)").Output()
	commitMsg := strings.TrimSpace(string(commitOut))
	if commitMsg != "" {
		sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cloned commit %s", nowStr(), commitMsg))
	}

	writeEnvFile(app, appDir)
	return nil
}

func writeEnvFile(app Application, appDir string) {
	var envBuilder strings.Builder
	for k, v := range app.EnvVars {
		envBuilder.WriteString(fmt.Sprintf("%s=%s\n", k, v))
	}
	_ = os.WriteFile(fmt.Sprintf("%s/.env", appDir), []byte(envBuilder.String()), 0600)
}
