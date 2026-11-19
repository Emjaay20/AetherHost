# Security rollout and evidence checklist

Complete local changes and CI first. Do not activate cloud resources or replace
production keys without a reviewed plan and recoverable key backup.

| Order | Action | Acceptance evidence |
| --- | --- | --- |
| 1 | Review code, CI results and expiring inherited findings | Required checks pass; no hidden broad exceptions |
| 2 | Provision protected vault keyring and legacy read key if needed | API starts; dry-run migration decrypts all records |
| 3 | Configure dashboard public build variables, GHCR pull access and Cosign | All built images pass scans and signer verification |
| 4 | Bootstrap root-owned release scripts through administrator access | CI account cannot modify scripts or execute general sudo commands |
| 5 | Apply branch/environment protection; set SSH fingerprint | API exports/settings review, denied direct push and unapproved deployment |
| 6 | Deploy release by approved revision and verify readiness | `/etc/aetherhost/release.json`, image digests and actual signer evidence |
| 7 | Apply secret migration; retain old keys for retained backups | No conflicts; follow-up dry-run and application checks pass |
| 8 | Provision private-service registry from trusted ownership | Forged headers, expired/revoked credentials and cross-tenant access fail |
| 9 | Install scanner/timer and approved backup DB image | Real fleet report and isolated DB restore result |
| 10 | Choose deployment-log retention; schedule protected cleanup | Dry-run count, approved policy, deletion result, audit data retained |
| 11 | Review Kubernetes digest/identity secret/CNI settings and reconcile | Restricted pod denial and enforced ingress/egress isolation |
| 12 | Validate/plan optional AWS environment using protected remote state | Reviewed account/cost plan; after apply, OIDC negative tests and CloudTrail evidence |
| 13 | Execute synthetic incident and full environment recovery | Dated timeline, observed containment and user-flow recovery result |

These external actions are not marked complete by code changes. The docs page
reflects repository controls and states the remaining activation requirements.
