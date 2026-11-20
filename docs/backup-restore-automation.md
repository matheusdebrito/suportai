# Backup, recovery and monitoring scripts (operator-only)

These scripts do not run automatically, do not schedule retention and **were not executed against production**. They are prepared for the hardened Compose topology in `deploy/compose.production.yml`.

Set `SUPORTAI_ENV_FILE` to the absolute path of the operator-managed Compose environment file. Keep it outside the repository. Access to Docker Engine and the database must be restricted to authorized operators; Docker socket access is effectively host-level privilege.

- `bash deploy/backup.sh /absolute/private/backup-dir`: writes a PostgreSQL 17 custom dump with mode 0600, checks the archive and produces a SHA-256 manifest. **Manually encrypt and copy the backup off-host.** The script never overwrites an existing filename.
- `bash deploy/verify-restore.sh /absolute/private/backup.dump`: creates a **new** database named `suportai_restore_...` (never drops an existing one), restores the archive and compares counts and PDF/knowledge invariants. It intentionally leaves the review database for an operator to inspect and manually remove after approval.
- `bash deploy/monitor.sh`: prints numeric counts of failed/stalled ingestion jobs and exits nonzero when a configured threshold is exceeded. Connect it to your organization's existing scheduler and alert routing, not to an unauthenticated public endpoint.

**Critical limitation:** the restore comparison is between the live source at rehearsal time and the selected backup. Historical backups may correctly differ from live data; in that case this script reports a mismatch for human review rather than promising zero data loss. Use an isolated database/service for a true recovery-time exercise and record elapsed time and recovery-point age.

None of the scripts grants permission to process real documents or call an external LLM. Operator sign-off, confidentiality and retention policy remain required.
