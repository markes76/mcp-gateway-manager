#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_NAME="MCP Gateway Manager.app"
RELEASE_DIR="${DESKTOP_DIR}/release"

if [[ ! -d "${RELEASE_DIR}" ]]; then
  echo "Release directory not found at ${RELEASE_DIR}."
  echo "Run packaging first: pnpm --filter @mcp-gateway/desktop package:mac"
  exit 1
fi

SOURCE_APP="$(find "${RELEASE_DIR}" -maxdepth 3 -type d -name "${APP_NAME}" | head -n 1 || true)"
if [[ -z "${SOURCE_APP}" ]]; then
  echo "Could not find ${APP_NAME} under ${RELEASE_DIR}."
  echo "Run packaging first: pnpm --filter @mcp-gateway/desktop package:mac"
  exit 1
fi

TARGET_APP="/Applications/${APP_NAME}"

echo "Installing ${APP_NAME}..."
if [[ -d "${TARGET_APP}" ]]; then
  rm -rf "${TARGET_APP}"
fi
ditto "${SOURCE_APP}" "${TARGET_APP}"

echo "Launching ${APP_NAME}..."
open -a "${TARGET_APP}"

echo "Installed at ${TARGET_APP}"
