package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const maxScannableFileBytes = 512 * 1024

type sourceThreatRule struct {
	name        string
	description string
	pattern     *regexp.Regexp
}

var sourceThreatRules = []sourceThreatRule{
	{
		name:        "nezha_c2_agent",
		description: "Nezha C2 remote administration agent artifact or reporting domain",
		pattern:     regexp.MustCompile(`(?i)(?:nezha-agent|nezhahq|vip1715\.dpdns\.org|maike\.fadehost\.app|cdn-9vr\.pages\.dev|nezha-agent-host)`),
	},
	{
		name:        "masqueraded_sysmon_binary",
		description: "Disguised binary execution in temporary system paths (/tmp/.sysmon)",
		pattern:     regexp.MustCompile(`(?i)(?:/tmp/\.sysmon|/tmp/\.X11-unix|/dev/shm/\.)`),
	},
	{
		name:        "crypto_miner_payload",
		description: "Cryptocurrency mining software or Stratum pool endpoint",
		pattern:     regexp.MustCompile(`(?i)(?:xmrig|stratum\+tcp://|stratum\+ssl://|moneroocean|cryptonight|pool\.minexmr)`),
	},
	{
		name:        "reverse_shell_redirection",
		description: "Interactive reverse shell socket redirection",
		pattern:     regexp.MustCompile(`(?i)(?:/dev/tcp/\d+\.\d+\.\d+\.\d+/\d+|nc\s+(?:-e|--exec)\s+/(?:bin|usr))`),
	},
}

// scanSourceTreeForThreats walks the checked-out application directory prior to
// building containers and verifies no files contain prohibited C2, miner, or
// reverse-shell payloads.
func scanSourceTreeForThreats(rootDir string) error {
	info, err := os.Stat(rootDir)
	if err != nil || !info.IsDir() {
		return nil
	}

	return filepath.WalkDir(rootDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if d.IsDir() {
			base := d.Name()
			if base == ".git" || base == "node_modules" || base == "vendor" || base == "target" {
				return filepath.SkipDir
			}
			return nil
		}

		fi, err := d.Info()
		if err != nil || fi.Size() == 0 || fi.Size() > maxScannableFileBytes {
			return nil
		}

		raw, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		relPath, relErr := filepath.Rel(rootDir, path)
		if relErr != nil {
			relPath = filepath.Base(path)
		}
		combined := relPath + "\n" + string(raw)

		for _, rule := range sourceThreatRules {
			if rule.pattern.MatchString(combined) {
				return fmt.Errorf("security pre-build scan rejected %q [%s]: %s", strings.ReplaceAll(relPath, "\\", "/"), rule.name, rule.description)
			}
		}
		return nil
	})
}
