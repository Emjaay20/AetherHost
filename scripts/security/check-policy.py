#!/usr/bin/env python3
"""Dependency-free checks for workflow pins and expiring vulnerability exceptions."""
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

def validate(root=ROOT, today=None):
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    errors = []
    for path in (root / '.github/workflows').glob('*.y*ml'):
        for line in path.read_text().splitlines():
            match = re.search(r'uses:\s*([^\s#]+)', line)
            if match and not match[1].startswith('./') and not re.fullmatch(r'[^@]+@[a-f0-9]{40}', match[1]):
                errors.append(f'{path.name}: action must use a full commit SHA: {match[1]}')
    findings = json.loads((root / 'docs/security/vulnerability-exceptions.json').read_text())
    actual = {line.strip() for line in (root / '.trivyignore').read_text().splitlines() if line.strip() and not line.startswith('#')}
    registered = set()
    for finding in findings:
        identifier = finding.get('id', '')
        if identifier in registered:
            errors.append(f'Duplicate exception: {identifier}')
        registered.add(identifier)
        if not all(finding.get(k) for k in ('id', 'owner', 'reason', 'expires', 'tracking')):
            errors.append(f'Incomplete exception: {identifier}')
        try:
            expires = datetime.date.fromisoformat(finding['expires'])
            if expires <= today or expires > today + datetime.timedelta(days=30):
                errors.append(f'{identifier}: expiry must be within the next 30 days')
        except (ValueError, KeyError):
            errors.append(f'{identifier}: invalid expiry')
    if actual != registered:
        errors.append('Trivy suppressions must exactly match the exception register')
    return errors

if __name__ == '__main__':
    errors = validate()
    print('\n'.join(errors) if errors else 'Security policy passed: immutable actions and time-limited exceptions')
    sys.exit(bool(errors))
