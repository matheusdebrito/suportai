#!/usr/bin/env bash
# Numeric-only monitoring. No credentials, SQL rows or document contents printed.
set -euo pipefail
if [[ -z "${SUPORTAI_ENV_FILE:-}" || ! "${SUPORTAI_ENV_FILE}" = /* || ! -f "${SUPORTAI_ENV_FILE}" ]]; then
  echo "SUPORTAI_ENV_FILE must point to an existing absolute configuration file" >&2
  exit 2
fi
limit="${FAILED_INGESTION_ALERT_THRESHOLD:-0}"
if [[ ! "$limit" =~ ^[0-9]+$ ]]; then echo "Invalid failure threshold" >&2; exit 2; fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --env-file "${SUPORTAI_ENV_FILE}" -f "$root/deploy/compose.production.yml")
counts="$("${compose[@]}" exec -T db psql -XAt -v ON_ERROR_STOP=1 -U suportai -d suportai \
  -c "SELECT count(*) FILTER (WHERE status='FAILED')::int, count(*) FILTER (WHERE status='RUNNING' AND updated_at < now()-interval '5 minutes')::int FROM ingestion_jobs")"
IFS='|' read -r failed stalled <<< "$counts"
if [[ ! "$failed" =~ ^[0-9]+$ || ! "$stalled" =~ ^[0-9]+$ ]]; then
  echo "Invalid database metrics" >&2
  exit 2
fi
echo "suportai_ingestion_failed $failed"
echo "suportai_ingestion_stalled $stalled"
if ((stalled>0||failed>limit)); then
  echo "ALERT: ingestion backlog requires review" >&2
  exit 1
fi
