package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

const workloadCredentialsFile = "workload-credentials.json"

// WorkloadCredentials are generated once per immutable workload deployment
// directory. Keeping them stable is required because PostgreSQL and MariaDB
// only apply their initial passwords when a data volume is first initialized.
type WorkloadCredentials struct {
	PostgresPassword string `json:"postgresPassword"`
	MariaDbPassword  string `json:"mariaDbPassword"`
	RedisPassword    string `json:"redisPassword"`
}

func validWorkloadCredential(value string) bool {
	if len(value) < 16 || len(value) > 128 {
		return false
	}
	for _, r := range value {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

func workloadCredentialsFor(appDir string) (WorkloadCredentials, error) {
	path := filepath.Join(appDir, workloadCredentialsFile)
	if data, err := os.ReadFile(path); err == nil {
		var credentials WorkloadCredentials
		if err := json.Unmarshal(data, &credentials); err != nil {
			return WorkloadCredentials{}, fmt.Errorf("read workload credentials: %w", err)
		}
		if !validWorkloadCredential(credentials.PostgresPassword) ||
			!validWorkloadCredential(credentials.MariaDbPassword) ||
			!validWorkloadCredential(credentials.RedisPassword) {
			return WorkloadCredentials{}, fmt.Errorf("stored workload credentials are invalid")
		}
		return credentials, nil
	} else if !os.IsNotExist(err) {
		return WorkloadCredentials{}, fmt.Errorf("read workload credentials: %w", err)
	}

	credentials := WorkloadCredentials{
		PostgresPassword: randomPassword(),
		MariaDbPassword:  randomPassword(),
		RedisPassword:    randomPassword(),
	}
	data, err := json.Marshal(credentials)
	if err != nil {
		return WorkloadCredentials{}, fmt.Errorf("encode workload credentials: %w", err)
	}

	temp, err := os.CreateTemp(appDir, ".workload-credentials-*")
	if err != nil {
		return WorkloadCredentials{}, fmt.Errorf("create workload credentials: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if err := temp.Chmod(0600); err != nil {
		_ = temp.Close()
		return WorkloadCredentials{}, fmt.Errorf("protect workload credentials: %w", err)
	}
	if _, err := temp.Write(data); err != nil {
		_ = temp.Close()
		return WorkloadCredentials{}, fmt.Errorf("write workload credentials: %w", err)
	}
	if err := temp.Close(); err != nil {
		return WorkloadCredentials{}, fmt.Errorf("close workload credentials: %w", err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return WorkloadCredentials{}, fmt.Errorf("save workload credentials: %w", err)
	}
	return credentials, nil
}
