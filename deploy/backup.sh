#!/usr/bin/env bash
# Run only on an authorized host. Never execute as part of API startup.
set -euo pipefail
umask 077
if [[ $# -ne 1 || ! "${1:-}" = /* || ! -d "${1:-}" || -L "${1:-}" ]]; then
  echo "Usage: backup.sh /absolute/private/backup-directory" >&2
  exit 2
fi
if [[ -z "${SUPORTAI_ENV_FILE:-}" || ! "${SUPORTAI_ENV_FILE}" = /* || ! -f "${SUPORTAI_ENV_FILE}" ]]; then
  echo "SUPORTAI_ENV_FILE must point to an existing absolute configuration file" >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose=(docker compose --env-file "${SUPORTAI_ENV_FILE}" -f "$root/deploy/compose.production.yml")
directory="$1"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$directory/suportai-$timestamp.dump"
if [[ -e "$final" || -L "$final" ]]; then
  echo "Refusing to overwrite an existing backup" >&2
  exit 2
fi
tmp="$(mktemp "$directory/.suportai-backup.XXXXXXXX")"
trap 'rm -f "$tmp"' EXIT
"${compose[@]}" exec -T db pg_dump -U suportai -d suportai --format=custom --no-owner --no-acl > "$tmp"
test -s "$tmp"
"${compose[@]}" exec -T db pg_restore --list < "$tmp" > /dev/null
ln -- "$tmp" "$final"
rm -f "$tmp"
sha256sum "$final" > "$final.sha256"
echo "Backup locally verified. Encrypt and copy it off-host under the approved retention policy."
echo "File: $final"
