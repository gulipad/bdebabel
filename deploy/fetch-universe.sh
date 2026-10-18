#!/usr/bin/env bash
# Downloads the universe's files that git does not keep (the model, from Hugging Face), checking each against
# the manifest's SHA-256. Usage: deploy/fetch-universe.sh babel-1
set -euo pipefail
name="${1:?universe name, e.g. babel-1}"
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$here/lab/universes/$name"
model="$(grep '^VITE_MODEL_URL=' "$here/app/.env.production" | cut -d= -f2-)"
node -e 'for (const [f, h] of Object.entries(require(process.argv[1]).files)) console.log(f, typeof h === "string" ? h : h.sha256)' "$root/manifest.json" |
	while read -r f sha; do
		if [ -f "$root/$f" ] && [ "$(shasum -a 256 "$root/$f" | cut -d' ' -f1)" = "$sha" ]; then continue; fi
		[ "$f" = model/model.bin ] && url="$model" || url="https://babel.gulipad.com/universe/$name/$f"
		echo "↓ $f"
		mkdir -p "$(dirname "$root/$f")"
		curl -fsSL "$url" -o "$root/$f"
		[ "$(shasum -a 256 "$root/$f" | cut -d' ' -f1)" = "$sha" ] || { echo "hash mismatch: $f" >&2; exit 1; }
	done
echo "$name is complete"
