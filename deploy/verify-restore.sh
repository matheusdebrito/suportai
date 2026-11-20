#!/usr/bin/env bash
# Restore only into a disposable networkless PostgreSQL CONTAINER/cluster.
# Never connects to the production database or Docker Compose production DB.
set -euo pipefail
umask 077
if [[ $# -ne 2 || ! "${1:-}" = /* || ! -f "${1:-}" || -L "${1:-}" ||
      ! "${2:-}" = /* || ! -d "${2:-}" || -L "${2:-}" ]]; then
  echo "Usage: verify-restore.sh /absolute/backup.dump /absolute/private/restore-work-dir" >&2
  exit 2
fi
file="$1"
work="$2"
if [[ -f "$file.sha256" ]]; then
  (cd "$(dirname "$file")" && sha256sum --check "$(basename "$file").sha256")
fi
restore_dir="$(mktemp -d "$work/suportai-restore.XXXXXXXX")"
container="suportai-restore-$(date -u +%Y%m%d%H%M%S)-$$"
cleanup(){
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT
# Trust authentication is safe ONLY because the dedicated validation
# container has no network namespace or published ports, and no secrets.
docker run -d --name "$container" --network none --memory 2g --cpus 1 \
  --pids-limit 128 --security-opt no-new-privileges \
  -e POSTGRES_USER=suportai -e POSTGRES_DB=suportai_restore \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$restore_dir:/var/lib/postgresql/data" \
  pgvector/pgvector:pg17 >/dev/null
ready=false
for ((i=0;i<60;i++)); do
  if docker exec "$container" pg_isready -U suportai -d suportai_restore >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "Disposable PostgreSQL did not become ready" >&2
  exit 1
fi
# pg_restore reads the chosen backup from stdin, not from production DB.
docker exec -i "$container" pg_restore --exit-on-error --no-owner --no-acl \
  -U suportai -d suportai_restore < "$file"
docker exec "$container" psql -XAt -v ON_ERROR_STOP=1 -U suportai -d suportai_restore \
  -c "SELECT CASE WHEN to_regtype('vector') IS NOT NULL AND to_regclass('public.schema_migrations') IS NOT NULL THEN 'ok' ELSE 'invalid' END" | grep -qx ok
for table in users departments spaces documents document_versions ingestion_jobs knowledge_chunks audit_events; do
  docker exec "$container" psql -XAt -v ON_ERROR_STOP=1 -U suportai -d suportai_restore \
    -c "SELECT count(*) FROM $table" > /dev/null
done
docker exec "$container" psql -XAt -v ON_ERROR_STOP=1 -U suportai -d suportai_restore \
  -c "SELECT 'restored_versions='||count(*), 'restored_pdf_bytes='||COALESCE(sum(octet_length(pdf_bytes)),0) FROM document_versions"
echo "Isolated restore succeeded. Container will be removed; restored data remains at:"
echo "$restore_dir"
echo "Operator must review RPO/RTO and manually dispose the temporary data afterward."
