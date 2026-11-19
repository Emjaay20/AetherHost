# Security incident exercise: compromised deployment identity

Status: runnable exercise plan; execution evidence not yet recorded.
Use an isolated environment and synthetic credentials, never compromise production.

| Stage | Exercise action | Evidence and pass condition |
| --- | --- | --- |
| Detect | Attempt forged role/tenant headers and an unsigned release | Authentication/authorization or signature verification rejects each attempt |
| Triage | Correlate actor, resource, source revision, digest and trace/time | Identify affected trust boundary; separate denied probes from accepted changes |
| Contain | Revoke a synthetic service token and rotate its registry | Subsequent access fails; unaffected identity remains functional |
| Remediate | Remove the simulated misconfiguration and release through CI | Reviewed fix and approved signed digest |
| Recover | Restore a synthetic backup into the isolated database | Database load and relationship checks pass; application exercise recorded separately |
| Prevent | Add regression coverage and assign corrective actions | Owner, due date, verification and review recorded |

Record start/end timestamps, alert source, decisions, data exposure assessment,
containment verification, recovery result and follow-up owners. Preserve original
logs in restricted storage; publish only redacted evidence. An exercise is complete
only after observed results are recorded. Never relabel a tabletop as a production
incident or a database restore as full platform recovery.
