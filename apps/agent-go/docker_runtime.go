package main

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
)

var (
	composePortLabel = regexp.MustCompile(`loadbalancer\.server\.port=(\d{1,5})`)
	dockerfileExpose = regexp.MustCompile(`(?mi)^\s*EXPOSE\s+(\d{1,5})`)
)

func validPort(p int) bool { return p > 0 && p <= 65535 }

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// detectAppPort determines which port the app listens on, in priority order:
// explicit app.Port, the Traefik port label in the AI-generated compose, an
// EXPOSE line in the Dockerfile, then 3000.
func detectAppPort(app Application, appDir string) int {
	if validPort(app.Port) {
		return app.Port
	}
	if m := composePortLabel.FindStringSubmatch(app.DockerCompose); m != nil {
		if p, err := strconv.Atoi(m[1]); err == nil && validPort(p) {
			return p
		}
	}
	if b, err := os.ReadFile(filepath.Join(appDir, "Dockerfile")); err == nil {
		if m := dockerfileExpose.FindSubmatch(b); m != nil {
			if p, err := strconv.Atoi(string(m[1])); err == nil && validPort(p) {
				return p
			}
		}
	}
	return 3000
}

// dockerRuntimeService returns the image/build stanza for the app service based
// on the source files present in appDir.
func dockerRuntimeService(appDir, hostAppDir string, port int) (stanza string, servePort int) {
	switch {
	case fileExists(filepath.Join(appDir, "Dockerfile")):
		return "    build: .\n", port
	case fileExists(filepath.Join(appDir, "Cargo.toml")):
		return fmt.Sprintf("    image: rust:1.80-slim\n    command: [\"cargo\", \"run\", \"--release\"]\n    volumes:\n      - %s:/app\n    working_dir: /app\n", hostAppDir), port
	case fileExists(filepath.Join(appDir, "package.json")):
		return fmt.Sprintf("    image: node:18-alpine\n    command: [\"sh\", \"-c\", \"npm install --no-fund && npm start\"]\n    volumes:\n      - %s:/app\n    working_dir: /app\n", hostAppDir), port
	case fileExists(filepath.Join(appDir, "go.mod")):
		return fmt.Sprintf("    image: golang:1.22-alpine\n    command: [\"sh\", \"-c\", \"go build -o /tmp/app . && /tmp/app\"]\n    volumes:\n      - %s:/app\n    working_dir: /app\n", hostAppDir), port
	case fileExists(filepath.Join(appDir, "requirements.txt")):
		entry := "main.py"
		if !fileExists(filepath.Join(appDir, entry)) && fileExists(filepath.Join(appDir, "app.py")) {
			entry = "app.py"
		}
		return fmt.Sprintf("    image: python:3.11-slim\n    command: [\"sh\", \"-c\", \"pip install -r requirements.txt && python %s\"]\n    volumes:\n      - %s:/app\n    working_dir: /app\n", entry, hostAppDir), port
	default:
		// Static site fallback: serve the directory with nginx on port 80.
		return fmt.Sprintf("    image: nginx:alpine\n    volumes:\n      - %s:/usr/share/nginx/html:ro\n", hostAppDir), 80
	}
}

func renderDockerRuntimeCompose(app Application, safeName, hostPwd, hostRule, tlsLabels string) string {
	appDir := filepath.Join("deployments", safeName)
	hostAppDir := fmt.Sprintf("%s/deployments/%s", hostPwd, safeName)
	stanza, port := dockerRuntimeService(appDir, hostAppDir, detectAppPort(app, appDir))

	return fmt.Sprintf(`
services:
  app:
%s    environment:
      PORT: "%d"
    mem_limit: 512m
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=aetherhost-net"
      - "traefik.http.routers.%s-app.rule=Host(%s)"%s
      - "traefik.http.services.%s-app.loadbalancer.server.port=%d"
    networks:
      - aetherhost-net
networks:
  aetherhost-net:
    external: true
`, stanza, port, safeName, hostRule, tlsLabels, safeName, port)
}
