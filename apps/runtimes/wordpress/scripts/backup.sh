#!/bin/bash
set -e

BACKUP_DIR="/backups/$(date +%Y-%m-%d_%H-%M-%S)"
mkdir -p "$BACKUP_DIR"

echo "Dumping database..."
mysqldump -u wordpress -p"$DB_PASSWORD" -h db wordpress > "$BACKUP_DIR/db.sql"

echo "Tarballing wp-content..."
tar -czf "$BACKUP_DIR/wp-content.tar.gz" -C /var/www/html wp-content

echo "Backup complete: $BACKUP_DIR"
