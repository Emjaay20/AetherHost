package main

import (
	"os"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type TelemetryMetric struct {
	ApplicationName string  `json:"applicationName"`
	MemoryMb        float64 `json:"memoryMb"`
	StorageMb       float64 `json:"storageMb"`
}

type TelemetryPayload struct {
	Metrics []TelemetryMetric `json:"metrics"`
}

func startTelemetryReporter(controlPlaneURL string) {
	ticker := time.NewTicker(10 * time.Second)
	
	for {
		<-ticker.C
		
		// Run docker stats
		cmd := exec.Command("docker", "stats", "--no-stream", "--format", "{{.Name}},{{.MemUsage}}")
		output, err := cmd.Output()
		if err != nil {
			fmt.Printf("Telemetry error: %v\n", err)
			continue
		}

		lines := strings.Split(string(output), "\n")
		var metrics []TelemetryMetric

		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			parts := strings.Split(line, ",")
			if len(parts) != 2 {
				continue
			}
			
			containerName := parts[0]
			if !strings.HasPrefix(containerName, "aetherhost-") || strings.HasPrefix(containerName, "aetherhost-db-") || containerName == "aetherhost-traefik" {
				continue
			}
			
			safeName := strings.TrimPrefix(containerName, "aetherhost-")
			
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
				if bytes, err := strconv.ParseFloat(sizeStr, 64); err == nil {
					storageMb = bytes / (1024 * 1024)
				}
			}
			
			metrics = append(metrics, TelemetryMetric{
				ApplicationName: safeName,
				MemoryMb:        memVal,
				StorageMb:       storageMb,
			})
		}
		
		if len(metrics) > 0 {
			payload := TelemetryPayload{Metrics: metrics}
			jsonBytes, _ := json.Marshal(payload)
			
			url := fmt.Sprintf("%s/v1/telemetry", controlPlaneURL)
			req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonBytes))
			req.Header.Set("Content-Type", "application/json")
			if key := os.Getenv("AGENT_SECRET_KEY"); key != "" {
				req.Header.Set("x-agent-key", key)
			}
			
			client := &http.Client{Timeout: 5 * time.Second}
			client.Do(req)
		}
	}
}
