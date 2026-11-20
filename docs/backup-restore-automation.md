# Backup, recovery and monitoring scripts (operator-only)

The scripts are prepared for `deploy/compose.production.yml`. **They were not executed against production** and are never run at application startup. The real disaster-recovery exercise must be authorized and its RPO/RTO recorded.

Set `SUPORTAI_ENV_FILE` to an absolute operator-managed Compose env path, outside Git. Restrict Docker Engine access to authorized administrators; controlling Docker is equivalent to high privilege on the host.

- `bash deploy/backup.sh /absolute/private/backup-dir`: writes PostgreSQL custom dump using a private temporary file and an atomic, no-overwrite final name. Produces a **portable** SHA-256 manifest. Encrypt and copy both artifacts off-host under your approved retention policy; this script intentionally does not choose a storage provider.
- `bash deploy/verify-restore.sh /absolute/private/backup.dump /absolute/private/restore-work-dir`: starts a **dedicated PostgreSQL 17 + pgvector container**, with `--network none`, no DB secret, no host port and CPU/memory/PID limits. Restores from stdin, validates schema/extensions/critical tables and prints only aggregate metrics. It does not connect to or modify the production database. The container is removed; its separate restored data directory remains for human review and manual disposal.
- `bash deploy/monitor.sh`: prints aggregate counts of failed and stalled ingestion jobs. Exit code is nonzero when a configurable failure threshold is crossed; connect this output to your organization's existing scheduler and alert routing.

**Do not use real company data in the disposable restoration without approval of the host storage, privacy safeguards and retention procedure.** The isolated restore verifies that the backup can be restored and queried; it does not prove historical RPO/RTO, application compatibility or off-host recoverability. Those require a supervised end-to-end rehearsal.
