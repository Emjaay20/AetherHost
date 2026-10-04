#!/bin/bash
set -e

BACKUP_DIR=$1
if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 <backup-dir>"
    exit 1
fi

echo "Restoring database..."
mysql -u wordpress -p"$DB_PASSWORD" -h db wordpress < "$BACKUP_DIR/db.sql"

echo "Restoring wp-content..."
tar -xzf "$BACKUP_DIR/wp-content.tar.gz" -C /var/www/html

echo "Restore complete from: $BACKUP_DIR"
