#!/usr/bin/env bash
# Nexora Node Agent compatibility launcher.
# Always downloads and executes the current installer from node-system/.

set -Eeuo pipefail
IFS=$'\n\t'

REPO_RAW="https://raw.githubusercontent.com/stripathi02123-tech/Nexora-panel3/main/node-system/install-node.sh"
TMP_FILE="$(mktemp /tmp/nexora-node-install.XXXXXX.sh)"
trap 'rm -f "$TMP_FILE"' EXIT

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Please run as root: sudo bash install-node.sh" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

CACHE_BUSTER="$(date +%s)"
echo "Downloading current Nexora Node Agent installer..."
curl -fL --retry 3 --connect-timeout 10 --max-time 120 \
  "${REPO_RAW}?v=${CACHE_BUSTER}" -o "$TMP_FILE"

if [[ ! -s "$TMP_FILE" ]]; then
  echo "Failed to download the Node Agent installer." >&2
  exit 1
fi

chmod 700 "$TMP_FILE"
exec bash "$TMP_FILE"
