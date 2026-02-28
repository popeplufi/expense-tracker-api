#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <health-url> <ready-url> [retries]"
  exit 1
fi

HEALTH_URL="$1"
READY_URL="$2"
RETRIES="${3:-20}"
SLEEP_SECONDS=5

probe() {
  local url="$1"
  curl --silent --show-error --fail "$url" >/dev/null
}

for i in $(seq 1 "$RETRIES"); do
  if probe "$HEALTH_URL" && probe "$READY_URL"; then
    echo "Release verified: health and readiness are OK."
    exit 0
  fi
  echo "Attempt $i/$RETRIES failed. Retrying in ${SLEEP_SECONDS}s..."
  sleep "$SLEEP_SECONDS"
done

echo "Release verification failed after $RETRIES attempts."
exit 1
