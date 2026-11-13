package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseKeyValueMetrics(t *testing.T) {
	values := parseKeyValueMetrics("active processes: 3\nidle processes: 4\n# Redis\nused_memory:1048576\ninvalid\n")
	if values["active processes"] != 3 || values["idle processes"] != 4 || values["used_memory"] != 1048576 {
		t.Fatalf("unexpected values: %#v", values)
	}
}

func TestWordPressMetricsAreInternalPrometheusFormat(t *testing.T) {
	wordpressMetricStore.Lock()
	wordpressMetricStore.byApplication = map[string]wordPressMetrics{
		"demo": {PHPActiveWorkers: 2, RedisEvictedKeys: 0, Ready: 1},
	}
	wordpressMetricStore.Unlock()
	recorder := httptest.NewRecorder()
	wordpressMetricsHandler(recorder, httptest.NewRequest("GET", "/metrics", nil))
	body := recorder.Body.String()
	if !strings.Contains(body, `aetherhost_wordpress_php_fpm_active_workers{application="demo"} 2`) || !strings.Contains(body, `aetherhost_wordpress_ready{application="demo"} 1`) {
		t.Fatalf("missing metrics: %s", body)
	}
}
