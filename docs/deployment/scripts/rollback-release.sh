#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/chat-to-image}"
TARGET_RELEASE="${1:-}"

if [[ -z "$TARGET_RELEASE" ]]; then
  echo "Usage: rollback-release.sh <release-directory-name>" >&2
  echo "Example: rollback-release.sh 2026-05-03T120000Z" >&2
  exit 1
fi

RELEASE_PATH="$APP_ROOT/releases/$TARGET_RELEASE"
if [[ ! -d "$RELEASE_PATH" ]]; then
  echo "Release not found: $RELEASE_PATH" >&2
  exit 1
fi

ln -sfn "$RELEASE_PATH" "$APP_ROOT/app"
systemctl restart chat-to-image-api.service
systemctl restart chat-to-image-worker.service

echo "Rolled back to $RELEASE_PATH"
