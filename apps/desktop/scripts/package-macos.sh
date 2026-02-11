#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${DESKTOP_DIR}"
export CSC_IDENTITY_AUTO_DISCOVERY=false

ELECTRON_DIST_PATH="$(
  pnpm exec node -e 'const path=require("path"); const electronPath=require("electron"); process.stdout.write(path.resolve(path.dirname(electronPath), "../../.."));'
)"

if [[ ! -d "${ELECTRON_DIST_PATH}/Electron.app" ]]; then
  echo "Could not locate local Electron distribution at ${ELECTRON_DIST_PATH}."
  exit 1
fi

pnpm exec electron-builder \
  --mac "$@" \
  --publish never \
  --config.electronDist="${ELECTRON_DIST_PATH}" \
  --config.mac.identity=null
