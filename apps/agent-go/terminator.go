package main

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
)

func terminateApps(controlPlaneURL string) {
	termApps, err := fetchApplicationsByStatus(controlPlaneURL, "terminating")
	if err != nil {
		logger.Warn("failed to poll terminating applications", slog.String("error", err.Error()))
		return
	}

	for _, app := range termApps {
		safeName := safeAppName(app.Name)
		appLog := logger.With(
			slog.String("app_id", app.ID),
			slog.String("app_name", app.Name),
			slog.String("safe_name", safeName),
		)
		appLog.Info("stopping and removing terminating container")

		_ = exec.Command("docker", "compose", "-f", fmt.Sprintf("./deployments/%s/docker-compose.yml", safeName), "-p", "aetherhost-"+safeName, "down").Run()
		_ = os.RemoveAll(fmt.Sprintf("./deployments/%s", safeName))

		delURL := fmt.Sprintf("%s/v1/applications/%s/hard", controlPlaneURL, app.ID)
		delResp, err := doControlPlaneRequest("DELETE", delURL, nil)
		if err != nil {
			appLog.Warn("hard delete control plane request failed", slog.String("error", err.Error()))
			continue
		}
		_, _ = io.Copy(io.Discard, delResp.Body)
		_ = delResp.Body.Close()

		if delResp.StatusCode < 200 || delResp.StatusCode >= 300 {
			appLog.Warn("hard delete returned non-2xx status", slog.Int("status_code", delResp.StatusCode))
			continue
		}
		appLog.Info("hard delete completed")
	}
}
