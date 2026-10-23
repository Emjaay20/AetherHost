package main

import (
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"
)

const (
	watchInterval   = 60 * time.Second
	maxRestartsIn   = 3
	restartWindowMs = 10 * time.Minute
)

var (
	lastWatch    time.Time
	restartTimes = map[string][]time.Time{}
)

// watchRunningApps catches apps that die after a successful deploy. A stopped
// container is restarted; if it keeps dying the app is marked failed so the
// dashboard tells the truth instead of showing "running".
func watchRunningApps(controlPlaneURL string) {
	if time.Since(lastWatch) < watchInterval {
		return
	}
	lastWatch = time.Now()

	apps, err := fetchApplicationsByStatus(controlPlaneURL, "running")
	if err != nil {
		return
	}
	for _, app := range apps {
		safeName := strings.ReplaceAll(strings.ToLower(app.Name), " ", "-")
		out, err := exec.Command("docker", "ps", "-a",
			"--filter", "label=com.docker.compose.project=aetherhost-"+safeName,
			"--format", "{{.Names}}|{{.State}}|{{.Status}}").Output()
		if err != nil {
			continue
		}
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			parts := strings.Split(line, "|")
			// Exited (0) is a finished one-shot job, not a crash.
			if len(parts) != 3 || parts[1] == "running" || parts[1] == "created" || strings.Contains(parts[2], "Exited (0)") {
				continue
			}
			name := parts[0]

			recent := restartTimes[app.ID][:0]
			for _, t := range restartTimes[app.ID] {
				if time.Since(t) < restartWindowMs {
					recent = append(recent, t)
				}
			}
			if len(recent) >= maxRestartsIn {
				sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Container %s keeps stopping (%d restarts in %s). Marking app failed.",
					time.Now().Format("15:04:05"), name, len(recent), restartWindowMs))
				updateAppStatus(controlPlaneURL, app.ID, "failed")
				delete(restartTimes, app.ID)
				break
			}
			restartTimes[app.ID] = append(recent, time.Now())
			logger.Warn("running app container is down; restarting", slog.String("app", app.Name), slog.String("container", name), slog.String("state", parts[1]))
			sendAppLog(controlPlaneURL, app.ID, fmt.Sprintf("[%s] Container %s was %s. Restarting automatically...", time.Now().Format("15:04:05"), name, parts[1]))
			_ = exec.Command("docker", "start", name).Run()
		}
	}
}
