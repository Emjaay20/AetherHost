package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

var httpClient = &http.Client{
	Timeout: 30 * time.Second,
}

var logger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	Level: slog.LevelInfo,
}))

type Application struct {
	ID                    string            `json:"id"`
	Name                  string            `json:"name"`
	Runtime               string            `json:"runtime"`
	Status                string            `json:"status"`
	GithubToken           string            `json:"githubToken,omitempty"`
	GithubRepo            string            `json:"githubRepo,omitempty"`
	GithubRepoName        string            `json:"githubRepoName,omitempty"`
	GithubRepoDescription string            `json:"githubRepoDescription,omitempty"`
	DockerCompose         string            `json:"dockerCompose,omitempty"`
	CustomDomain          string            `json:"customDomain,omitempty"`
	DockerImage           string            `json:"dockerImage,omitempty"`
	EnvVars               map[string]string `json:"envVars,omitempty"`
	WorkerCommand         string            `json:"workerCommand,omitempty"`
	WithPostgres          bool              `json:"withPostgres,omitempty"`
	WithRedis             bool              `json:"withRedis,omitempty"`
	Port                  int               `json:"port,omitempty"`
	HealthPath            string            `json:"healthPath,omitempty"`
	CommitMessage         string            `json:"commitMessage,omitempty"`
	AiFiles               []struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	} `json:"aiFiles,omitempty"`
}

func randomPassword() string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, 16)
	maxIdx := big.NewInt(int64(len(chars)))
	for i := range b {
		n, err := rand.Int(rand.Reader, maxIdx)
		if err != nil {
			b[i] = chars[i%len(chars)]
			continue
		}
		b[i] = chars[n.Int64()]
	}
	return string(b)
}

func doControlPlaneRequest(method, url string, bodyReader io.Reader) (*http.Response, error) {
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, err
	}
	if bodyReader != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("x-agent-key", os.Getenv("AGENT_SECRET_KEY"))
	return httpClient.Do(req)
}

func fetchApplicationsByStatus(controlPlaneURL, status string) ([]Application, error) {
	url := fmt.Sprintf("%s/v1/applications?status=%s", controlPlaneURL, status)
	resp, err := doControlPlaneRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
	}()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected HTTP status %d from %s", resp.StatusCode, url)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var apps []Application
	if err := json.Unmarshal(body, &apps); err != nil {
		return nil, fmt.Errorf("invalid applications JSON from %s: %w", url, err)
	}
	return apps, nil
}

func updateAppStatus(controlPlaneURL, appID, status string) {
	statusData := fmt.Sprintf(`{"status":"%s"}`, status)
	url := fmt.Sprintf("%s/v1/applications/%s/status", controlPlaneURL, appID)
	resp, err := doControlPlaneRequest("PATCH", url, strings.NewReader(statusData))
	if err != nil {
		logger.Warn("failed to update application status", slog.String("app_id", appID), slog.String("status", status), slog.String("error", err.Error()))
		return
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Warn("status update returned non-2xx HTTP status", slog.String("app_id", appID), slog.Int("status_code", resp.StatusCode))
	}
}

func sendAppLog(controlPlaneURL, appID, message string) {
	logger.Info("application deployment log", slog.String("app_id", appID), slog.String("message", message))
	body, err := json.Marshal(map[string]string{"log": message})
	if err != nil {
		return
	}
	url := fmt.Sprintf("%s/v1/applications/%s/logs", controlPlaneURL, appID)
	resp, doErr := doControlPlaneRequest("POST", url, strings.NewReader(string(body)))
	if doErr != nil {
		return
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	_ = resp.Body.Close()
}

func main() {
	controlPlaneURL := os.Getenv("CONTROL_PLANE_URL")
	if controlPlaneURL == "" {
		controlPlaneURL = "http://localhost:3000"
	}

	hostPwd := os.Getenv("HOST_PWD")
	if hostPwd == "" {
		hostPwd = "/opt/aetherhost"
	}

	baseDomain := os.Getenv("BASE_DOMAIN")
	if baseDomain == "" {
		baseDomain = "localhost"
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go startTelemetryReporter(ctx, controlPlaneURL)

	logger.Info("AetherHost Go Agent started; polling control plane", slog.String("control_plane_url", controlPlaneURL))

	for {
		if ctx.Err() != nil {
			logger.Info("shutdown signal received; exiting")
			return
		}

		provisionPendingApps(controlPlaneURL, hostPwd, baseDomain)
		terminateApps(controlPlaneURL)
		suspendApps(controlPlaneURL)

		select {
		case <-ctx.Done():
			logger.Info("shutdown signal received; exiting")
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func probeContainer(container, rawURL string) error {
	return exec.Command("docker", "run", "--rm", "--network", "container:"+container, "alpine:3.20", "wget", "-q", "-O", "-", rawURL).Run()
}
