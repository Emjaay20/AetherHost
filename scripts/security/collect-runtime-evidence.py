#!/usr/bin/env python3
"""Collect value-free, read-only production evidence. Never inspect container environments."""
import datetime
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

CONTROL_ROOT = Path('/srv/aetherhost/control')
REPORT_ROOT = Path('/var/lib/aetherhost/security/evidence')
SERVICES = ('api', 'dashboard', 'agent')
DIGEST = re.compile(r'^ghcr\.io/emjaay20/aetherhost-(api|dashboard|agent)@sha256:[a-f0-9]{64}$')
CONTAINER_FORMAT = (
    '{"image":{{json .Config.Image}},"user":{{json .Config.User}},'
    '"readonly":{{json .HostConfig.ReadonlyRootfs}},'
    '"cap_drop":{{json .HostConfig.CapDrop}},'
    '"security_opt":{{json .HostConfig.SecurityOpt}}}'
)
POSTURE_JS = """
const { PrismaClient } = require('/app/apps/api/node_modules/@prisma/client');
const { SecretVaultService } = require('/app/apps/api/dist/common/crypto/secret-vault.service.js');
(async () => {
  const db = new PrismaClient();
  try {
    const vault = new SecretVaultService();
    const counts = { applications: 0, empty: 0, v2: 0, v1: 0, plaintext: 0, invalid: 0 };
    let cursor;
    for (;;) {
      const rows = await db.application.findMany({
        take: 100, orderBy: { id: 'asc' }, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, tenantId: true, envVars: true }
      });
      if (!rows.length) break;
      for (const row of rows) {
        counts.applications++;
        if (row.envVars == null) { counts.empty++; continue; }
        try {
          vault.decrypt(row.envVars, 'application:' + row.tenantId + ':' + row.id);
          if (row.envVars.__encrypted === true) {
            if (row.envVars.version === 2) counts.v2++; else counts.v1++;
          } else counts.plaintext++;
        } catch { counts.invalid++; }
      }
      cursor = rows[rows.length - 1].id;
    }
    console.log(JSON.stringify(counts));
  } finally { await db.$disconnect(); }
})().catch(() => { console.error('Posture query unavailable; no data values emitted'); process.exitCode = 1; });
"""

def command(args, timeout=30):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
        return result.returncode, result.stdout
    except (OSError, subprocess.TimeoutExpired):
        return -1, ''

def json_command(args, timeout=30):
    code, output = command(args, timeout)
    if code != 0:
        return {'status': 'unavailable'}
    try:
        return json.loads(output)
    except (ValueError, TypeError):
        return {'status': 'unavailable'}

def validate_container(actual, expected):
    if not isinstance(actual, dict) or not isinstance(actual.get('image'), str):
        return {'status': 'unavailable'}
    image = actual['image']
    user = str(actual.get('user', '')).split(':')[0]
    return {
        'status': 'observed',
        'image': image if DIGEST.fullmatch(image) else 'non-immutable-reference',
        'matches_release': bool(expected and image == expected and DIGEST.fullmatch(image)),
        'non_root': bool(user and user not in ('0', 'root')),
        'readonly_root': actual.get('readonly') is True,
        'drops_all_capabilities': 'ALL' in (actual.get('cap_drop') or []),
        'no_new_privileges': any(str(item).startswith('no-new-privileges') for item in (actual.get('security_opt') or [])),
    }

def sudo_summary(output, returncode):
    if returncode:
        return {'status': 'unavailable'}
    grants = [line.strip() for line in output.splitlines() if re.match(r'^\s*\(', line)]
    broad = any(re.search(r'\)\s*(?:NOPASSWD:\s*)?ALL(?:\s|,|$)', line) for line in grants)
    return {'status': 'observed', 'broad_all_commands_grant': broad, 'grant_entries': len(grants)}

def root_owned_path(path):
    try:
        info = path.stat()
        return info.st_uid == 0 and not bool(stat.S_IMODE(info.st_mode) & 0o022)
    except OSError:
        return False

def snapshot_summary(rows, now):
    if not isinstance(rows, list) or len(rows) != 1:
        return {'status': 'unavailable'}
    try:
        timestamp = datetime.datetime.fromisoformat(rows[0]['time'].replace('Z', '+00:00'))
        age = int((now - timestamp).total_seconds())
        return {'status': 'observed', 'age_seconds': age, 'within_24h': -300 <= age <= 86400}
    except (KeyError, ValueError, TypeError):
        return {'status': 'unavailable'}

def scan_summary(path, expected, now):
    try:
        recorded_image = path.with_suffix('.image').read_text().strip()
        report = json.loads(path.read_text())
        counts = {'HIGH': 0, 'CRITICAL': 0}
        for result in report.get('Results', []):
            for finding in result.get('Vulnerabilities') or []:
                severity = finding.get('Severity')
                if severity in counts:
                    counts[severity] += 1
        age = int(now.timestamp() - path.stat().st_mtime)
        return {'status': 'observed', 'matches_release': recorded_image == expected,
                'age_seconds': age, 'within_24h': 0 <= age <= 86400, 'findings': counts}
    except (OSError, ValueError, TypeError, AttributeError):
        return {'status': 'unavailable'}

def collect():
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        release = json.loads(Path('/etc/aetherhost/release.json').read_text())
    except (OSError, ValueError):
        release = {}
    revision = release.get('revision', '')
    report = {
        'schema_version': 1, 'collected_at': now.isoformat(),
        'revision': revision if re.fullmatch(r'[a-f0-9]{40}', str(revision)) else 'unknown',
        'scope': 'read-only production observation; no keys rotated, records migrated, or logs deleted',
        'containers': {}, 'scans': {}, 'services': {},
    }
    for service in SERVICES:
        _, raw = command(['docker', 'inspect', 'aetherhost-' + service, '--format', CONTAINER_FORMAT])
        try:
            actual = json.loads(raw)
        except ValueError:
            actual = {}
        expected = release.get(service)
        report['containers'][service] = validate_container(actual, expected)
        report['scans'][service] = scan_summary(Path('/var/lib/aetherhost/security/latest') / (service + '.json'), expected, now)
    code, permissions = command(['sudo', '-n', '-l', '-U', 'engineer'])
    report['operator_access'] = sudo_summary(permissions, code)
    code, groups = command(['id', '-nG', 'engineer'])
    report['operator_access']['docker_group_membership'] = 'docker' in groups.split() if code == 0 else None
    report['root_owned_deployment_boundary'] = all(root_owned_path(path) for path in (
        Path('/srv'), Path('/srv/aetherhost'), CONTROL_ROOT, CONTROL_ROOT / 'deploy',
        CONTROL_ROOT / 'deploy/deploy-production.sh', CONTROL_ROOT / 'deploy/verify-image.sh',
    ))
    for unit in ('aetherhost-backup.service', 'aetherhost-restore-check.service', 'aetherhost-fleet-scan.service'):
        code, output = command(['systemctl', 'show', unit, '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'ExecMainStartTimestamp'])
        fields = dict(line.split('=', 1) for line in output.splitlines() if '=' in line)
        report['services'][unit] = {key: fields.get(key, 'unknown') for key in ('Result', 'ExecMainStatus', 'ExecMainStartTimestamp')} if code == 0 else {'status': 'unavailable'}
    report['secret_inventory'] = json_command(['docker', 'exec', 'aetherhost-api', 'node', '-e', POSTURE_JS], 120)
    report['secret_migration_preview'] = json_command(['docker', 'exec', '-w', '/app/apps/api', 'aetherhost-api', 'node', 'dist-security/scripts/migrate-secrets.js'], 120)
    report['retention_preview'] = json_command(['docker', 'exec', '-e', 'DEPLOYMENT_LOG_RETENTION_DAYS=90', '-w', '/app/apps/api', 'aetherhost-api', 'node', 'dist-security/scripts/enforce-retention.js'], 60)
    # Protected backup configuration is sourced only when it is root-owned and not writable by other accounts.
    config = Path('/etc/aetherhost/backup.env')
    if root_owned_path(config) and not bool(stat.S_IMODE(config.stat().st_mode) & 0o007):
        rows = json_command(['bash', '-c', 'set -a; source /etc/aetherhost/backup.env; set +a; exec restic snapshots --latest 1 --tag aetherhost,production --json'], 45)
        report['backup_snapshot'] = snapshot_summary(rows, now)
    else:
        report['backup_snapshot'] = {'status': 'unavailable'}
    return report

def main():
    if os.geteuid() != 0:
        print('Runtime evidence collection requires the administrator-owned deployment path', file=sys.stderr)
        return 1
    REPORT_ROOT.mkdir(parents=True, mode=0o700, exist_ok=True)
    if REPORT_ROOT.resolve() != REPORT_ROOT or not root_owned_path(REPORT_ROOT) or not root_owned_path(REPORT_ROOT.parent):
        print('Unsafe evidence directory; refusing to write', file=sys.stderr)
        return 1
    report = collect()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    path = REPORT_ROOT / (stamp + '-' + report['revision'][:12] + '.json')
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(report, output, indent=2)
        output.write('\n')
    # This explicit allowlist contains no environment values, tenant identifiers, log contents or credentials.
    print('AETHER_SECURITY_EVIDENCE=' + json.dumps(report, separators=(',', ':')))
    return 0

if __name__ == '__main__':
    sys.exit(main())
