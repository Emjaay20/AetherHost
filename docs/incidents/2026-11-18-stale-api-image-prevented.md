# Release integrity: stale API image prevented

## Summary

On 18 November 2026, a control-plane deployment checked out the intended source
revision but initially started the API image from the preceding revision. The
API remained healthy, so an ordinary health check alone would not have detected
the mismatch. No tenant data was changed and no customer request was lost.

The mismatch was caught before accepting the release because the expected
compiled Spacefast operation reconciler was absent from the running image.

## Timeline

| Time (WAT) | Event |
| --- | --- |
| 03:18 | Commit `98e1cf1` merged to `main`; the image-publishing workflow began. |
| 03:20 | The VPS checked out `98e1cf1`, pulled the mutable `latest` API tag, and restarted a healthy API from the previous image revision `25b8975`. |
| 03:21 | Runtime verification found that the reconciler module was not in the container. The deployment was not accepted as complete. |
| 03:24 | The signed image workflow completed for `98e1cf1`. |
| 03:27 | The VPS pulled the image whose OCI revision label matched `98e1cf1`, recreated only the API, and passed readiness checks. |

## Root cause

Source deployment and image publication are separate GitHub Actions workflows.
The source checkout reached the host before the publish workflow had moved the
mutable `latest` image tag to the same commit. The deployment script treated a
successful image pull and a healthy HTTP endpoint as sufficient evidence.

Those checks prove availability, not provenance.

## Remediation

- The production deployment script now reads the checked-out Git revision and
  repeatedly pulls the API image until its OCI
  `org.opencontainers.image.revision` label exactly matches that revision.
- It waits for up to five minutes, then fails closed rather than recreating the
  API from a stale image.
- The affected release was verified with the matching image revision, the
  compiled reconciler module, and `/v1/ready` returning PostgreSQL readiness.
- The Rust lockfile was updated from `actix-http` 3.21.0 to 3.21.3 to resolve
  the advisories that had independently made the broad main-branch CI gate red.

## Prevention and verification

A release is now complete only when all of these agree:

1. the control-plane checkout is clean and at the intended Git revision;
2. the pulled API image carries that exact revision label;
3. the API container starts successfully and passes `/v1/ready`;
4. the release-specific artifact is present in the running image when the
   change warrants it.

This protects the platform from the failure mode where a deployment looks
healthy but silently serves an older control-plane build.
