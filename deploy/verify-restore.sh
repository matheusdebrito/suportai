#!/usr/bin/env bash
# Creates a NEW isolated database. Never drops or replaces a production database.
set -euo pipefail
umask 077
if [[ $# -ne 1 || ! "${1:-}" = /* || ! -f "${1:-}" || -L "${1:-}" ]]; then
  echo "Usage: verify-restore.sh /absolute/suportai-backup.dump" >&2
  exit 2
fi
if [[ -z "${SUPORTAI_ENV_FILE:-}" || ! "${SUPORTAI_ENV_FILE}" = /* || ! -f "${SUPORTAI_ENV_FILE}" ]]; then
  echo "SUPORTAI_ENV_FILE must point to an existing absolute configuration file" >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --env-file "${SUPORTAI_ENV_FILE}" -f "$root/deploy/compose.production.yml")
file="$1"
if [[ -f "$file.sha256" ]]; then
  (cd "$(dirname "$file")" && sha256sum --check "$(basename "$file").sha256")
fi
"${compose[@]}" exec -T db pg_restore --list < "$file" > /dev/null
target="suportai_restore_$(date -u +%Y%m%d%H%M%S)_$$"
if [[ ! "$target" =~ ^suportai_restore_[0-9]{14}_[0-9]+$ ]]; then
  echo "Invalid disposable restore database name" >&2
  exit 2
fi
"${compose[@]}" exec -T db createdb -U suportai "$target"
echo "New verification database: $target"
echo "No cleanup is performed automatically; a DBA must review before dropping it."
"${compose[@]}" exec -T db pg_restore --exit-on-error --no-owner --no-acl -U suportai -d "$target" < "$file"
for table in schema_migrations users departments spaces documents document_versions ingestion_jobs knowledge_chunks audit_events; do
  before="$("${compose[@]}" exec -T db psql -XAt -v ON_ERROR_STOP=1 -U suportai -d suportai -c "SELECT count(*) FROM $table")"
  after="$("${compose[@]}" exec -T db psql -XAt -v ON_ERROR_STOP=1 -U suportai -d "$target" -c "SELECT count(*) FROM $table")"
  if [[ "$before" != "$after" ]]; then
    echo "Restore count mismatch: $table" >&2
    exit 1
  fi
done
for sql in \
  "SELECT COALESCE(sum(octet_length(pdf_bytes)),0) FROM document_versions" \
  "SELECT count(*) FROM documents WHERE current_version_id IS NOT NULL" \
  "SELECT count(*) FROM knowledge_chunks WHERE embedding IS NOT NULL"; do
  before="$("${compose[@]}" exec -T db psql -XAt -v ON_ERROR_STOP=1 -U suportai -d suportai -c "$sql")"
  after="$("${compose[@]}" exec -T db psql -XAt -v ON_ERROR_STOP=1 -U suportai -d "$target" -c "$sql")"
  if [[ "$before" != "$after" ]]; then
    echo "Restore invariant mismatch" >&2
    exit 1
  fi
done
"${compose[@]}" exec -T db psql -XAt -v ON_ERROR_STOP=1 -U suportai -d "$target" \
  -c "SELECT CASE WHEN to_regtype('vector') IS NOT NULL THEN 'ok' ELSE 'fail' END" | grep -qx ok
echo "Disposable restore validation passed. Verify RPO/RTO, perform human review and safely clean up."
