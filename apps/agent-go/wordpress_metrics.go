package main

import (
	"fmt"
	"net/http"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"sync"
)

type wordPressMetrics struct {
	PHPActiveWorkers    float64
	PHPIdleWorkers      float64
	PHPListenQueue      float64
	PHPMaxChildrenHit   float64
	PHPSlowRequests     float64
	MariaConnections    float64
	MariaMaxConnections float64
	MariaQuestions      float64
	MariaSlowQueries    float64
	MariaBufferPoolHits float64
	MariaBufferPoolRead float64
	RedisUsedMemory     float64
	RedisKeyspaceHits   float64
	RedisKeyspaceMisses float64
	RedisEvictedKeys    float64
	Ready               float64
}

var wordpressMetricStore = struct {
	sync.RWMutex
	byApplication map[string]wordPressMetrics
}{byApplication: map[string]wordPressMetrics{}}

func parseKeyValueMetrics(output string) map[string]float64 {
	values := map[string]float64{}
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		sep := strings.IndexAny(line, ":=")
		if sep < 1 {
			continue
		}
		key := strings.TrimSpace(line[:sep])
		value, err := strconv.ParseFloat(strings.TrimSpace(line[sep+1:]), 64)
		if err == nil {
			values[key] = value
		}
	}
	return values
}

func parseTabMetrics(output string) map[string]float64 {
	values := map[string]float64{}
	for _, line := range strings.Split(output, "\n") {
		parts := strings.Fields(line)
		if len(parts) != 2 {
			continue
		}
		value, err := strconv.ParseFloat(parts[1], 64)
		if err == nil {
			values[parts[0]] = value
		}
	}
	return values
}

// refreshWordPressMetrics runs through Docker's existing agent permission, not
// through a public exporter. All status endpoints remain private to the
// workload network or container namespace.
func refreshWordPressMetrics() {
	output, err := exec.Command("docker", "ps", "--format", "{{.Names}}").Output()
	if err != nil {
		return
	}
	next := map[string]wordPressMetrics{}
	for _, nginxName := range strings.Fields(string(output)) {
		if !strings.HasPrefix(nginxName, "aetherhost-") || !strings.HasSuffix(nginxName, "-nginx") {
			continue
		}
		identity := strings.TrimSuffix(strings.TrimPrefix(nginxName, "aetherhost-"), "-nginx")
		metrics := wordPressMetrics{}

		if phpStatus, statusErr := exec.Command("docker", "exec", nginxName, "wget", "-q", "-O", "-", "http://127.0.0.1/fpm-status").Output(); statusErr == nil {
			php := parseKeyValueMetrics(string(phpStatus))
			metrics.PHPActiveWorkers = php["active processes"]
			metrics.PHPIdleWorkers = php["idle processes"]
			metrics.PHPListenQueue = php["listen queue"]
			metrics.PHPMaxChildrenHit = php["max children reached"]
			metrics.PHPSlowRequests = php["slow requests"]
			metrics.Ready = 1
		}

		mariaName := "aetherhost-" + identity + "-mariadb"
		mariaCommand := `exec mariadb -N -s -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" -e "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Questions','Slow_queries','Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads'); SHOW VARIABLES WHERE Variable_name = 'max_connections'"`
		if mariaStatus, statusErr := exec.Command("docker", "exec", mariaName, "sh", "-c", mariaCommand).Output(); statusErr == nil {
			db := parseTabMetrics(string(mariaStatus))
			metrics.MariaConnections = db["Threads_connected"]
			metrics.MariaMaxConnections = db["max_connections"]
			metrics.MariaQuestions = db["Questions"]
			metrics.MariaSlowQueries = db["Slow_queries"]
			metrics.MariaBufferPoolHits = db["Innodb_buffer_pool_read_requests"]
			metrics.MariaBufferPoolRead = db["Innodb_buffer_pool_reads"]
		}

		redisName := "aetherhost-" + identity + "-redis"
		if redisStatus, statusErr := exec.Command("docker", "exec", redisName, "sh", "-c", `redis-cli -a "$REDIS_PASSWORD" INFO stats memory`).Output(); statusErr == nil {
			redis := parseKeyValueMetrics(string(redisStatus))
			metrics.RedisUsedMemory = redis["used_memory"]
			metrics.RedisKeyspaceHits = redis["keyspace_hits"]
			metrics.RedisKeyspaceMisses = redis["keyspace_misses"]
			metrics.RedisEvictedKeys = redis["evicted_keys"]
		}
		next[identity] = metrics
	}
	wordpressMetricStore.Lock()
	wordpressMetricStore.byApplication = next
	wordpressMetricStore.Unlock()
}

func wordpressMetricsHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	wordpressMetricStore.RLock()
	defer wordpressMetricStore.RUnlock()
	apps := make([]string, 0, len(wordpressMetricStore.byApplication))
	for app := range wordpressMetricStore.byApplication {
		apps = append(apps, app)
	}
	sort.Strings(apps)
	for _, app := range apps {
		metrics := wordpressMetricStore.byApplication[app]
		label := fmt.Sprintf(`{application=%q}`, app)
		for name, value := range map[string]float64{
			"aetherhost_wordpress_php_fpm_active_workers":          metrics.PHPActiveWorkers,
			"aetherhost_wordpress_php_fpm_idle_workers":            metrics.PHPIdleWorkers,
			"aetherhost_wordpress_php_fpm_listen_queue":            metrics.PHPListenQueue,
			"aetherhost_wordpress_php_fpm_max_children_reached":    metrics.PHPMaxChildrenHit,
			"aetherhost_wordpress_php_fpm_slow_requests_total":     metrics.PHPSlowRequests,
			"aetherhost_wordpress_mariadb_connections":             metrics.MariaConnections,
			"aetherhost_wordpress_mariadb_max_connections":         metrics.MariaMaxConnections,
			"aetherhost_wordpress_mariadb_questions_total":         metrics.MariaQuestions,
			"aetherhost_wordpress_mariadb_slow_queries_total":      metrics.MariaSlowQueries,
			"aetherhost_wordpress_mariadb_buffer_pool_hits_total":  metrics.MariaBufferPoolHits,
			"aetherhost_wordpress_mariadb_buffer_pool_reads_total": metrics.MariaBufferPoolRead,
			"aetherhost_wordpress_redis_used_memory_bytes":         metrics.RedisUsedMemory,
			"aetherhost_wordpress_redis_keyspace_hits_total":       metrics.RedisKeyspaceHits,
			"aetherhost_wordpress_redis_keyspace_misses_total":     metrics.RedisKeyspaceMisses,
			"aetherhost_wordpress_redis_evicted_keys_total":        metrics.RedisEvictedKeys,
			"aetherhost_wordpress_ready":                           metrics.Ready,
		} {
			_, _ = fmt.Fprintf(w, "%s%s %g\n", name, label, value)
		}
	}
}

func startWordPressMetricsServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/metrics", wordpressMetricsHandler)
	go func() {
		if err := http.ListenAndServe(":9108", mux); err != nil {
			logger.Warn("wordpress metrics server stopped", "error", err.Error())
		}
	}()
}
