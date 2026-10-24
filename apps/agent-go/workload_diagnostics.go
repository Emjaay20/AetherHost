package main

import (
	"fmt"
	"os/exec"
	"strings"
)

const maxWorkloadDiagnosticBytes = 16 * 1024

// workloadDiagnostics captures only process state and recent stdout/stderr. It
// intentionally runs before compose down so a failed readiness probe remains
// actionable in the dashboard and the agent logs.
func workloadDiagnostics(plan WorkloadPlan) string {
	var report strings.Builder
	for _, container := range plan.Containers {
		fmt.Fprintf(&report, "\n== %s state ==\n", container)
		state, err := exec.Command("docker", "inspect", "--format", "status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}{{if .State.Health}} health={{.State.Health.Status}}{{end}}", container).CombinedOutput()
		if err != nil {
			fmt.Fprintf(&report, "inspect unavailable: %s", strings.TrimSpace(string(state)))
		} else {
			report.WriteString(strings.TrimSpace(string(state)))
		}

		fmt.Fprintf(&report, "\n== %s recent output ==\n", container)
		output, err := exec.Command("docker", "logs", "--tail", "120", container).CombinedOutput()
		if err != nil {
			fmt.Fprintf(&report, "logs unavailable: %s", strings.TrimSpace(string(output)))
		} else if len(output) == 0 {
			report.WriteString("(no output)")
		} else {
			report.WriteString(strings.TrimSpace(string(output)))
		}
	}

	result := strings.TrimSpace(report.String())
	if len(result) > maxWorkloadDiagnosticBytes {
		return result[:maxWorkloadDiagnosticBytes] + "\n[diagnostic output truncated]"
	}
	return result
}
