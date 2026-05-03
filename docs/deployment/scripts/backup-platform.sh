#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/chat-to-image/shared/env/production.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/chat-to-image/shared/backups}"
OUTPUT_DIR="${PLATFORM_OUTPUT_DIR:-/opt/chat-to-image/shared/images}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" | gzip -9 > "$BACKUP_DIR/postgres-$TIMESTAMP.sql.gz"

if [[ -d "$OUTPUT_DIR" ]]; then
  tar -C "$OUTPUT_DIR" -czf "$BACKUP_DIR/images-$TIMESTAMP.tar.gz" .
fi

find "$BACKUP_DIR" -type f -name '*.gz' -mtime +14 -delete

echo "Backup written to $BACKUP_DIR"
