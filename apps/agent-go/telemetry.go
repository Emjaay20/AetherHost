package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type TelemetryMetric struct {
	ApplicationName string  `json:"applicationName"`
	MemoryMb        float64 `json:"memoryMb"`
	StorageMb       float64 `json:"storageMb"`
	// BandwidthDeltaMb is outbound traffic since the previous report.
	BandwidthDeltaMb float64 `json:"bandwidthDeltaMb"`
}

// Tenant containers are named "<project>-<service>-<n>", where the project is the
// app's safe name, optionally prefixed with "aetherhost-". Control-plane containers
// (aetherhost-api, aetherhost-traefik, ...) have no numeric suffix and never match.
var tenantContainerPattern = regexp.MustCompile(`^(?:aetherhost-)?(.+)-([a-z0-9_]+)-\d+$`)

func appNameFromContainer(container string) (string, bool) {
	m := tenantContainerPattern.FindStringSubmatch(container)
	if m == nil {
		return "", false
	}
	return m[1], true
}

// parseDockerSize converts values like "1.2MB", "340kB", "12MiB" to bytes.
func parseDockerSize(raw string) float64 {
	raw = strings.TrimSpace(raw)
	units := []struct {
		suffix string
		mult   float64
	}{
		{"TiB", 1 << 40}, {"GiB", 1 << 30}, {"MiB", 1 << 20}, {"KiB", 1 << 10},
		{"TB", 1e12}, {"GB", 1e9}, {"MB", 1e6}, {"kB", 1e3}, {"KB", 1e3}, {"B", 1},
	}
	for _, u := range units {
		if strings.HasSuffix(raw, u.suffix) {
			v, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(raw, u.suffix)), 64)
			if err != nil {
				return 0
			}
			return v * u.mult
		}
	}
	return 0
}

type dirSizeEntry struct {
	mb float64
	at time.Time
}

var dirSizeCache = map[string]dirSizeEntry{}

// deploymentDirMb returns the on-disk size of an app's source directory, cached
// for five minutes because walking large trees every 10s is wasteful.
func deploymentDirMb(appName string) float64 {
	if e, ok := dirSizeCache[appName]; ok && time.Since(e.at) < 5*time.Minute {
		return e.mb
	}
	var total int64
	_ = filepath.WalkDir(filepath.Join("deployments", appName), func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if info, ierr := d.Info(); ierr == nil {
			total += info.Size()
		}
		return nil
	})
	mb := float64(total) / (1024 * 1024)
	dirSizeCache[appName] = dirSizeEntry{mb: mb, at: time.Now()}
	return mb
}

// lastTxBytes remembers each container's previous outbound counter so we can
// report deltas; counters reset when a container is recreated.
var lastTxBytes = map[string]float64{}

type TelemetryPayload struct {
	Metrics []TelemetryMetric `json:"metrics"`
}

func startTelemetryReporter(ctx context.Context, controlPlaneURL string) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		// Run docker stats
		cmd := exec.Command("docker", "stats", "--no-stream", "--format", "{{.Name}}|{{.MemUsage}}|{{.NetIO}}")
		output, err := cmd.Output()
		if err != nil {
			continue
		}

		lines := strings.Split(string(output), "\n")
		var metrics []TelemetryMetric

		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			parts := strings.Split(line, "|")
			if len(parts) != 3 {
				continue
			}

			containerName := parts[0]
			safeName, ok := appNameFromContainer(containerName)
			if !ok {
				continue
			}

			var bwDeltaMb float64
			if io := strings.Split(parts[2], "/"); len(io) == 2 {
				tx := parseDockerSize(io[1])
				if prev, seen := lastTxBytes[containerName]; seen {
					if tx >= prev {
						bwDeltaMb = (tx - prev) / (1024 * 1024)
					} else {
						bwDeltaMb = tx / (1024 * 1024) // counter reset after redeploy
					}
				}
				lastTxBytes[containerName] = tx
			}

			memStr := parts[1]
			memStr = strings.Split(memStr, "/")[0] // "120MiB "
			memStr = strings.TrimSpace(memStr)

			var memVal float64
			if strings.HasSuffix(memStr, "GiB") || strings.HasSuffix(memStr, "GB") {
				val, _ := strconv.ParseFloat(memStr[:len(memStr)-3], 64)
				memVal = val * 1024
			} else if strings.HasSuffix(memStr, "MiB") || strings.HasSuffix(memStr, "MB") {
				val, _ := strconv.ParseFloat(memStr[:len(memStr)-3], 64)
				memVal = val
			} else if strings.HasSuffix(memStr, "KiB") || strings.HasSuffix(memStr, "KB") {
				val, _ := strconv.ParseFloat(memStr[:len(memStr)-3], 64)
				memVal = val / 1024
			} else if strings.HasSuffix(memStr, "B") {
				memVal = 0 // Negligible
			}

			// Get Storage Size (SizeRw from docker inspect -s)
			var storageMb float64 = 0
			sizeCmd := exec.Command("docker", "inspect", "-s", "--format", "{{.SizeRw}}", containerName)
			sizeOutput, err := sizeCmd.Output()
			if err == nil {
				sizeStr := strings.TrimSpace(string(sizeOutput))
				if bytesVal, err := strconv.ParseFloat(sizeStr, 64); err == nil {
					storageMb = bytesVal / (1024 * 1024)
				}
			}

			metrics = append(metrics, TelemetryMetric{
				ApplicationName:  safeName,
				MemoryMb:         memVal,
				StorageMb:        storageMb + deploymentDirMb(safeName),
				BandwidthDeltaMb: bwDeltaMb,
			})
		}

		if len(metrics) > 0 {
			payload := TelemetryPayload{Metrics: metrics}
			jsonBytes, err := json.Marshal(payload)
			if err != nil {
				continue
			}

			url := fmt.Sprintf("%s/v1/telemetry", controlPlaneURL)
			resp, err := doControlPlaneRequest("POST", url, bytes.NewBuffer(jsonBytes))
			if err == nil {
				_, _ = io.Copy(io.Discard, resp.Body)
				_ = resp.Body.Close()
			}
		}
	}
}
