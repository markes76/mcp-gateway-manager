#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORKSPACE_DIR="$(cd "${DESKTOP_DIR}/../.." && pwd)"

SOURCE_LOGO="${WORKSPACE_DIR}/logo.png"
TARGET_ICON="${DESKTOP_DIR}/build/icon.icns"

if [[ ! -f "${SOURCE_LOGO}" ]]; then
  echo "Missing source logo at ${SOURCE_LOGO}"
  exit 1
fi

python3 - "${SOURCE_LOGO}" "${TARGET_ICON}" <<'PY'
from pathlib import Path
import sys

from PIL import Image

src = Path(sys.argv[1])
out = Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)

img = Image.open(src).convert("RGBA")
# Keep aspect ratio and center on an opaque white square for clean app icon rendering.
max_side = max(img.size)
canvas = Image.new("RGBA", (max_side, max_side), (255, 255, 255, 255))
overlay = Image.new("RGBA", (max_side, max_side), (0, 0, 0, 0))
offset = ((max_side - img.width) // 2, (max_side - img.height) // 2)
overlay.paste(img, offset, img)
canvas = Image.alpha_composite(canvas, overlay)

if max_side < 1024:
    canvas = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)
elif max_side > 1024:
    canvas = canvas.resize((1024, 1024), Image.Resampling.LANCZOS)

sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)]
canvas.save(out, format="ICNS", sizes=sizes)
print(f"Generated icon at {out}")
PY
