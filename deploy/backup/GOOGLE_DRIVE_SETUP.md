# Free encrypted Google Drive backups

This runbook uses **rclone** to reach Google Drive and **restic** to encrypt,
deduplicate, retain, and verify backups. Google receives encrypted repository
data only; it never receives the readable database dump, environment file, or
tenant data.

## One-time setup on the VPS

1. Install the required packages:

   ```bash
   sudo apt-get update && sudo apt-get install -y rclone restic
   ```

2. Create an isolated rclone configuration. Use your own Google OAuth client
   when possible, then authorize the `gdrive` remote in the browser flow:

   ```bash
   sudo mkdir -p /etc/aetherhost
   sudo rclone config --config /etc/aetherhost/rclone.conf
   sudo chmod 600 /etc/aetherhost/rclone.conf
   ```

3. Generate a repository passphrase. Save it in your password manager: losing
   it makes the encrypted backups unrecoverable.

   ```bash
   sudo sh -c 'openssl rand -base64 48 > /etc/aetherhost/restic-password'
   sudo chmod 600 /etc/aetherhost/restic-password
   ```

4. Copy `backup.env.example` to `/etc/aetherhost/backup.env`, set the Google
   Drive path, and lock it down:

   ```bash
   sudo cp /opt/aetherhost/deploy/backup/backup.env.example /etc/aetherhost/backup.env
   sudo chmod 600 /etc/aetherhost/backup.env
   sudo nano /etc/aetherhost/backup.env
   ```

5. Install the timers and run the first backup and restore drill:

   ```bash
   sudo /opt/aetherhost/deploy/install-operations-timers.sh
   sudo systemctl start aetherhost-backup.service
   sudo systemctl start aetherhost-restore-check.service
   ```

## What is backed up

- PostgreSQL logical dump for the control plane.
- AetherHost and tenant Docker volumes whose names begin with `aetherhost`.
- Production configuration, encrypted environment configuration, deployment
  metadata, and tenant source files.

Docker images, old layers, and BuildKit cache are intentionally excluded: the
deployment workflow rebuilds them, while keeping them would unnecessarily use
Drive storage.

## Recovery principle

Run a restore drill every week. A successful backup is useful only after a
restore check has passed. This repository provides a non-destructive drill;
an actual database or volume replacement should be performed during a declared
recovery operation using the recovered artifacts.
