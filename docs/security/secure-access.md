# Authenticated service access

The Rust router, log daemon and Actix adapter no longer accept identity/ownership
assertions from `x-user-id`, `x-tenant-id`, `x-role`, or target-tenant headers.
Private services use a server-owned registry of expiring bearer credentials and
resource ownership. Unknown identities and resources fail closed. Router upstream
requests strip service credentials and identity assertions.

This is a service-to-service adapter, not an OAuth replacement. Public tenant
websites continue through the public ingress; do not route them through this
private authenticated gateway without a separate public-routing design. Browser
log clients should use a trusted backend adapter, never an embedded service key.

Set `AETHER_IDENTITY_CONFIG_FILE` to a root/secret-managed JSON file readable by
the service identity. Example schema (replace placeholders; never commit real values):

```json
{
  "credentials": [{
    "token": "<random-32-or-more-character-server-token>",
    "subject_id": "deployment-worker-01",
    "tenant_id": "tenant-alpha",
    "role": "developer",
    "expires_at": 1893456000
  }],
  "resources": {"app-alpha": "tenant-alpha"}
}
```

Router resources are extracted application subdomains; log resources are app IDs;
Actix resources are exact server paths. Supply ownership from reviewed control-plane
records, not from request data. The registry is an initial static adapter: reload
requires a process rollout. Automate that registry reconciliation before using it
for a rapidly changing fleet. Admin credentials are explicit cross-tenant authority;
issue them only for an audited operator requirement. Viewer access needs a matching
read-only policy; it is not implicitly granted.

Rotation: add replacement credentials, roll out trusted clients, remove old entries,
restart services, then verify the revoked token fails. Expiry is checked per request. WebSocket streams disconnect at credential expiry
or after 15 minutes, requiring fresh authentication. Registry replacement/restart
revokes active sessions.
The log daemon authenticates metrics requests. Protect router metrics with the
configured metrics credential and keep both services behind internal ingress.

## Operator access rollout

1. Inventory effective privileges with `sudo -l -U engineer`, group membership,
   SSH authorized keys, `/etc/sudoers`, and all sudoers drop-ins. Keep outputs private.
2. Install the root-owned deployment entry point. Do not give the CI user write
   access to its checkout, parent directories, verification script, or Git config.
3. Retain an independent tested administrator session and emergency access method.
4. Remove broader sudo grants and Docker-group access through the host configuration
   authority, validate with `visudo`, and test through a second connection.
5. Verify CI can invoke only the deployment entry point; `sudo sh`, arbitrary
   `sudo git` and Docker access must fail. Validate SSH host fingerprints in CI.
6. Revoke an individual identity and record the failed follow-up access attempt.

The narrow sudoers file alone does not remove other grants. Production privilege
removal and account access review were not executed in this implementation session.
