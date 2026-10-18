#!/usr/bin/env bash
# Downloads a published universe's files that git does not keep (the model), checking each against the
# manifest's SHA-256. Usage: deploy/fetch-universe.sh babel-1
set -euo pipefail
name="${1:?universe name, e.g. babel-1}"
base="${UNIVERSE_URL:-https://universo.gulipad.com}/$name"
root="$(cd "$(dirname "$0")/.." && pwd)/lab/universes/$name"
node -e 'for (const [f, h] of Object.entries(require(process.argv[1]).files)) console.log(f, typeof h === "string" ? h : h.sha256)' "$root/manifest.json" |
	while read -r f sha; do
		if [ -f "$root/$f" ] && [ "$(shasum -a 256 "$root/$f" | cut -d' ' -f1)" = "$sha" ]; then continue; fi
		echo "↓ $f"
		mkdir -p "$(dirname "$root/$f")"
		curl -fsSL "$base/$f" -o "$root/$f"
		[ "$(shasum -a 256 "$root/$f" | cut -d' ' -f1)" = "$sha" ] || { echo "hash mismatch: $f" >&2; exit 1; }
	done
echo "$name is complete"
