package main

import (
	"fmt"
	"strings"
)

// buildWordPressWorkload is a platform-owned profile. It uses the same plan,
// credentials, private network and health-gated lifecycle as an image
// workload; the only difference is the fixed process graph.
func buildWordPressWorkload(app Application, identity, mariaDBPassword, redisPassword string) (WorkloadPlan, error) {
	identity = safeAppName(identity)
	if identity == "" || identity == "app" {
		return WorkloadPlan{}, fmt.Errorf("invalid workload identity")
	}
	if !validCustomDomain(app.CustomDomain) {
		return WorkloadPlan{}, fmt.Errorf("invalid custom domain")
	}
	resources, err := wordpressResources(app.WorkloadMemoryMB)
	if err != nil {
		return WorkloadPlan{}, err
	}
	tuning, err := deriveWordPressTuning(resources)
	if err != nil {
		return WorkloadPlan{}, err
	}

	publicName := safeAppName(app.Name)
	nginxName := "aetherhost-" + identity + "-nginx"
	phpName := "aetherhost-" + identity + "-php"
	mariaName := "aetherhost-" + identity + "-mariadb"
	redisName := "aetherhost-" + identity + "-redis"

	var b strings.Builder
	b.WriteString("services:\n")
	writeWordPressNginx(&b, nginxName, phpName, identity, publicName, app.CustomDomain, resources)
	writeWordPressPHP(&b, phpName, mariaName, redisName, resources)
	writeWordPressMariaDB(&b, mariaName, resources)
	writeWordPressRedis(&b, redisName, resources)
	b.WriteString("\nnetworks:\n")
	b.WriteString("  aetherhost-net:\n    external: true\n")
	b.WriteString("  private:\n")
	b.WriteString("\nvolumes:\n")
	// These names intentionally match the legacy Compose project so an existing
	// WordPress deployment continues to use its posts/uploads and database.
	fmt.Fprintf(&b, "  wordpress_data:\n    name: aetherhost-%s_wordpress_data\n", identity)
	fmt.Fprintf(&b, "  db_data:\n    name: aetherhost-%s_db_data\n", identity)

	wordpressEnv := fmt.Sprintf("WORDPRESS_DB_HOST=%s\nWORDPRESS_DB_USER=wordpress\nWORDPRESS_DB_PASSWORD=%s\nWORDPRESS_DB_NAME=wordpress\nREDIS_PASSWORD=%s\nWORDPRESS_CONFIG_EXTRA=define('WP_REDIS_HOST', '%s'); define('WP_REDIS_PORT', 6379); define('WP_REDIS_PASSWORD', getenv('REDIS_PASSWORD'));\n", mariaName, mariaDBPassword, redisPassword, redisName)
	mariaEnv := fmt.Sprintf("MARIADB_DATABASE=wordpress\nMARIADB_USER=wordpress\nMARIADB_PASSWORD=%s\nMARIADB_RANDOM_ROOT_PASSWORD=1\n", mariaDBPassword)
	redisEnv := fmt.Sprintf("REDIS_PASSWORD=%s\n", redisPassword)

	return WorkloadPlan{
		Compose:      b.String(),
		WordPressEnv: wordpressEnv,
		MariaDbEnv:   mariaEnv,
		RedisEnv:     redisEnv,
		ConfigFiles: map[string]string{
			"wordpress-nginx.conf":   wordpressNginxConfig(phpName),
			"wordpress-php-fpm.conf": wordpressPHPFPMConfig(tuning),
			"wordpress-mariadb.cnf":  wordpressMariaDBConfig(tuning),
		},
		Alias:      nginxName,
		Containers: []string{nginxName, phpName, mariaName, redisName},
		Port:       80,
		HealthPath: "/.aetherhost/ready",
	}, nil
}

func writeWordPressNginx(b *strings.Builder, nginxName, phpName, identity, publicName, customDomain string, resources WordPressResources) {
	fmt.Fprintf(b, "  %s:\n", nginxName)
	b.WriteString("    image: nginx:1.27-alpine\n")
	fmt.Fprintf(b, "    container_name: %s\n", nginxName)
	b.WriteString("    volumes:\n      - wordpress_data:/var/www/html:ro\n      - ./wordpress-nginx.conf:/etc/nginx/conf.d/default.conf:ro\n")
	writeServiceLifecycle(b, resources.NginxMB, 96, true)
	// nginx binds the routed HTTP port, initializes its private cache directory,
	// then drops its workers to the nginx user and group. Grant only the four
	// capabilities that lifecycle requires after the default capability drop.
	b.WriteString("    cap_add:\n      - NET_BIND_SERVICE\n      - CHOWN\n      - SETGID\n      - SETUID\n")
	b.WriteString("    labels:\n")
	b.WriteString("      - \"traefik.enable=true\"\n")
	b.WriteString("      - \"traefik.docker.network=aetherhost-net\"\n")
	baseDomain := osBaseDomain()
	if customDomain != "" {
		fmt.Fprintf(b, "      - \"traefik.http.routers.%s-app.rule=Host(`%s.%s`) || Host(`%s`)\"\n", identity, publicName, baseDomain, customDomain)
	} else {
		fmt.Fprintf(b, "      - \"traefik.http.routers.%s-app.rule=Host(`%s.%s`)\"\n", identity, publicName, baseDomain)
	}
	if shouldUseTLS(baseDomain) {
		fmt.Fprintf(b, "      - \"traefik.http.routers.%s-app.entrypoints=websecure\"\n", identity)
		fmt.Fprintf(b, "      - \"traefik.http.routers.%s-app.tls.certresolver=letsencrypt\"\n", identity)
	}
	fmt.Fprintf(b, "      - \"traefik.http.services.%s-app.loadbalancer.server.port=80\"\n", identity)
	b.WriteString("    networks:\n      private: {}\n      aetherhost-net:\n")
	fmt.Fprintf(b, "        aliases:\n          - %s\n", nginxName)
	b.WriteString("    depends_on:\n")
	fmt.Fprintf(b, "      %s:\n        condition: service_started\n", phpName)
	b.WriteString("    healthcheck:\n")
	b.WriteString("      test: [\"CMD-SHELL\", \"wget -q -O - http://127.0.0.1/.aetherhost/ready >/dev/null\"]\n")
	b.WriteString("      interval: 5s\n      timeout: 3s\n      retries: 20\n")
}

func writeWordPressPHP(b *strings.Builder, phpName, mariaName, redisName string, resources WordPressResources) {
	fmt.Fprintf(b, "  %s:\n", phpName)
	// Keep the legacy major PHP version for data-preserving migrations. Runtime
	// upgrades are a separate, tested customer change rather than a side effect
	// of moving onto the workload contract.
	b.WriteString("    image: wordpress:php8.2-fpm-alpine\n")
	fmt.Fprintf(b, "    container_name: %s\n", phpName)
	b.WriteString("    env_file:\n      - wordpress.env\n")
	b.WriteString("    volumes:\n      - wordpress_data:/var/www/html\n      - ./wordpress-php-fpm.conf:/usr/local/etc/php-fpm.d/zz-aetherhost.conf:ro\n")
	writeServiceLifecycle(b, resources.PHPMB, 192, true)
	// PHP-FPM starts as root and drops its workers to www-data. Retain only the
	// identity-transition capabilities required for that unprivileged runtime.
	b.WriteString("    cap_add:\n      - SETGID\n      - SETUID\n")
	b.WriteString("    networks:\n      private: {}\n")
	b.WriteString("    depends_on:\n")
	fmt.Fprintf(b, "      %s:\n        condition: service_healthy\n", mariaName)
	fmt.Fprintf(b, "      %s:\n        condition: service_healthy\n", redisName)
}

func writeWordPressMariaDB(b *strings.Builder, mariaName string, resources WordPressResources) {
	fmt.Fprintf(b, "  %s:\n", mariaName)
	// Existing WordPress volumes were initialized by MariaDB 10.11. Do not turn
	// the contract migration into a database-major-version upgrade.
	b.WriteString("    image: mariadb:10.11\n")
	fmt.Fprintf(b, "    container_name: %s\n", mariaName)
	b.WriteString("    env_file:\n      - mariadb.env\n")
	b.WriteString("    volumes:\n      - db_data:/var/lib/mysql\n      - ./wordpress-mariadb.cnf:/etc/mysql/conf.d/zz-aetherhost.cnf:ro\n")
	writeServiceLifecycle(b, resources.MariaMB, 128, false)
	b.WriteString("    networks:\n      private: {}\n")
	b.WriteString("    healthcheck:\n")
	b.WriteString("      test: [\"CMD-SHELL\", \"mariadb-admin ping -h localhost -u \\\"$$MARIADB_USER\\\" -p\\\"$$MARIADB_PASSWORD\\\" --silent\"]\n")
	b.WriteString("      interval: 5s\n      timeout: 3s\n      retries: 20\n")
}

func writeWordPressRedis(b *strings.Builder, redisName string, resources WordPressResources) {
	fmt.Fprintf(b, "  %s:\n", redisName)
	b.WriteString("    image: redis:7-alpine\n")
	fmt.Fprintf(b, "    container_name: %s\n", redisName)
	b.WriteString("    env_file:\n      - redis.env\n")
	// Redis is an object cache, not a source of record. Disable persistence so
	// the unprivileged upstream image never needs to mutate a root-owned volume.
	// WordPress content remains in wordpress_data and MariaDB's db_data volume.
	b.WriteString("    command: [\"sh\", \"-c\", \"exec redis-server --save \\\"\\\" --appendonly no --requirepass \\\"$$REDIS_PASSWORD\\\"\"]\n")
	writeServiceLifecycle(b, resources.RedisMB, 128, true)
	b.WriteString("    networks:\n      private: {}\n")
	b.WriteString("    healthcheck:\n")
	b.WriteString("      test: [\"CMD-SHELL\", \"redis-cli -a \\\"$$REDIS_PASSWORD\\\" ping | grep PONG\"]\n")
	b.WriteString("      interval: 5s\n      timeout: 3s\n      retries: 20\n")
}

func writeServiceLifecycle(b *strings.Builder, memoryMB, pids int, dropCapabilities bool) {
	b.WriteString("    init: true\n    stop_grace_period: 30s\n")
	fmt.Fprintf(b, "    mem_limit: %dm\n    pids_limit: %d\n", memoryMB, pids)
	b.WriteString("    restart: unless-stopped\n    security_opt:\n      - no-new-privileges:true\n")
	if dropCapabilities {
		b.WriteString("    cap_drop:\n      - ALL\n")
	}
}

func wordpressNginxConfig(phpName string) string {
	config := `server {
    listen 80;
    server_name _;
    root /var/www/html;
    index index.php index.html;

    # Readiness must traverse PHP-FPM. A static 204 would prove only that
    # nginx started, allowing a broken PHP process to be marked healthy.
    location = /.aetherhost/ready {
        access_log off;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /fpm-ping;
        fastcgi_param SCRIPT_NAME /fpm-ping;
        fastcgi_pass php:9000;
    }
    location = /fpm-ping {
        internal;
        access_log off;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /fpm-ping;
        fastcgi_param SCRIPT_NAME /fpm-ping;
        fastcgi_pass php:9000;
    }
    location = /fpm-status {
        allow 127.0.0.1;
        deny all;
        access_log off;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME /fpm-status;
        fastcgi_param SCRIPT_NAME /fpm-status;
        fastcgi_pass php:9000;
    }
    location / { try_files $uri $uri/ /index.php?$args; }
    location ~ /\. { deny all; access_log off; log_not_found off; }
    location ~* \.(jpg|jpeg|gif|png|css|js|ico|webp|woff2)$ { expires max; log_not_found off; access_log off; }
    location = /wp-login.php {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass php:9000;
    }
    location ~ \.php$ {
        try_files $uri =404;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_pass php:9000;
    }
}
`
	return strings.ReplaceAll(config, "fastcgi_pass php:9000", fmt.Sprintf("fastcgi_pass %s:9000", phpName))
}

func wordpressPHPFPMConfig(t WordPressTuning) string {
	return fmt.Sprintf(`[www]
pm = dynamic
pm.max_children = %d
pm.start_servers = %d
pm.min_spare_servers = %d
pm.max_spare_servers = %d
request_slowlog_timeout = 5s
slowlog = /tmp/www-slow.log
ping.path = /fpm-ping
ping.response = pong
pm.status_path = /fpm-status
php_admin_value[memory_limit] = %dM
php_admin_value[max_execution_time] = 60
php_admin_value[upload_max_filesize] = 50M
php_admin_value[post_max_size] = 50M
php_admin_value[opcache.enable] = 1
php_admin_value[opcache.memory_consumption] = %d
php_admin_value[opcache.interned_strings_buffer] = 8
php_admin_value[opcache.max_accelerated_files] = 10000
php_admin_value[opcache.validate_timestamps] = 1
php_admin_value[opcache.revalidate_freq] = 2
php_admin_value[opcache.save_comments] = 1
`, t.PHPMaxChildren, t.PHPStart, t.PHPMinSpare, t.PHPMaxSpare, t.PHPMemoryMB, t.OPcacheMB)
}

func wordpressMariaDBConfig(t WordPressTuning) string {
	return fmt.Sprintf(`[mysqld]
innodb_buffer_pool_size = %dM
innodb_flush_log_at_trx_commit = 1
sync_binlog = 1
max_connections = %d
slow_query_log = 1
slow_query_log_file = /var/lib/mysql/mariadb-slow.log
long_query_time = 2
log_bin = /var/lib/mysql/mariadb-bin
binlog_expire_logs_seconds = 604800
server-id = 1
`, t.MariaBufferMB, t.MariaMaxConns)
}
