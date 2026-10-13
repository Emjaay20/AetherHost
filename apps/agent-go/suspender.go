package main

import (
	"fmt"
	"log/slog"
	"os/exec"
)

func suspendApps(controlPlaneURL string) {
	suspApps, err := fetchApplicationsByStatus(controlPlaneURL, "suspending")
	if err != nil {
		logger.Warn("failed to poll suspending applications", slog.String("error", err.Error()))
		return
	}

	for _, app := range suspApps {
		safeName := safeAppName(app.Name)
		appLog := logger.With(
			slog.String("app_id", app.ID),
			slog.String("app_name", app.Name),
			slog.String("safe_name", safeName),
		)
		appLog.Info("suspending container")

		_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("./deployments/%s/docker-compose.yml", safeName), "-p", "aetherhost-"+safeName, "stop").Run()

		updateAppStatus(controlPlaneURL, app.ID, "suspended")
		appLog.Info("workload suspended")
	}
}
