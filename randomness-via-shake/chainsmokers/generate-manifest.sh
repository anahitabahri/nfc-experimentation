#!/usr/bin/env bash
# Regenerate songs.json from the contents of ./songs.
# Run after adding/removing songs:  ./generate-manifest.sh
set -euo pipefail
cd "$(dirname "$0")"

python3 - <<'PY' > songs.json
import os, json
exts = ('.m4a', '.mp3', '.wav', '.ogg')
songs = sorted(f for f in os.listdir('songs') if f.lower().endswith(exts))
print(json.dumps(songs, indent=2))
PY

count=$(python3 -c "import json; print(len(json.load(open('songs.json'))))")
echo "wrote songs.json ($count tracks)"
