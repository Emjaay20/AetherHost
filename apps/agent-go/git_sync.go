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

	// 1. Fast sync only when the existing .git directory is a usable
	// repository. A partially copied checkout can contain an empty .git folder;
	// treating that as valid leaves the project permanently undeployable.
	validRepository := false
	if _, err := os.Stat(gitDir); err == nil {
		validRepository = exec.Command("git", "-C", appDir, "rev-parse", "--is-inside-work-tree").Run() == nil
		if !validRepository {
			appLog.Warn("invalid git metadata found; preserving checkout before clean clone")
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Existing checkout is incomplete; preserving it before a clean clone...", nowStr()))
		}
	}
	if validRepository {
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

	// 2. Preserve the old checkout before cloning. The running container keeps
	// serving its current image while the replacement is prepared, and a failed
	// clone can be rolled back without losing project files or its local .env.
	recoveryDir := ""
	if _, err := os.Stat(appDir); err == nil {
		recoveryDir = filepath.Join(filepath.Dir(appDir), fmt.Sprintf(".%s-recovery-%d", safeName, time.Now().UTC().Unix()))
		if err := os.Rename(appDir, recoveryDir); err != nil {
			return fmt.Errorf("cannot preserve existing checkout before clone: %w", err)
		}
	}
	if err := os.MkdirAll(filepath.Dir(appDir), 0755); err != nil {
		return fmt.Errorf("cannot create project parent directory: %w", err)
	}

	sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Cloning repository: %s", nowStr(), app.GithubRepo))
	appLog.Info("cloning github repository", slog.String("repo", app.GithubRepo))

	out, err := runGitWithToken(app.GithubToken, "clone", "--depth", "1", app.GithubRepo, appDir)
	if err != nil {
		// git can leave a partial target directory. Remove only that newly-created
		// partial clone, then restore the preserved checkout when possible.
		_ = os.RemoveAll(appDir)
		if recoveryDir != "" {
			_ = os.Rename(recoveryDir, appDir)
		}
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

	if len(app.EnvVars) == 0 && recoveryDir != "" {
		if env, readErr := os.ReadFile(filepath.Join(recoveryDir, ".env")); readErr == nil {
			_ = os.WriteFile(filepath.Join(appDir, ".env"), env, 0600)
		}
	}
	writeEnvFile(app, appDir)
	return nil
}

func writeEnvFile(app Application, appDir string) {
	// Do not replace a project's local environment file with an empty file when
	// it has not yet been imported into the control plane.
	if len(app.EnvVars) == 0 {
		return
	}
	var envBuilder strings.Builder
	for k, v := range app.EnvVars {
		envBuilder.WriteString(fmt.Sprintf("%s=%s\n", k, v))
	}
	_ = os.WriteFile(fmt.Sprintf("%s/.env", appDir), []byte(envBuilder.String()), 0600)
}
