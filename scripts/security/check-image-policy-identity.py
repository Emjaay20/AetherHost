#!/usr/bin/env python3
"""Ensure deployment verification and admission trust the same signer."""
import re
from pathlib import Path

verifier = Path('deploy/verify-image.sh').read_text()
policy = Path('deploy/policies/kyverno/security.yaml').read_text()


def one(pattern: str, value: str) -> str:
    matches = re.findall(pattern, value, re.MULTILINE)
    if len(matches) != 1:
        raise SystemExit(f'Expected exactly one match for {pattern!r}')
    return matches[0]


if one(r"--certificate-identity-regexp '([^']+)'", verifier) != one(r"^\s+subjectRegExp: '([^']+)'", policy):
    raise SystemExit('Image signer identity differs between deploy and Kyverno policy')
if one(r"--certificate-oidc-issuer '([^']+)'", verifier) != one(r'^\s+issuer: (\S+)', policy):
    raise SystemExit('Image signer issuer differs between deploy and Kyverno policy')
print('Image signer identity and issuer match.')
