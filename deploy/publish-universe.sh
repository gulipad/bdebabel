#!/usr/bin/env bash
# Publishes a frozen universe to the R2 bucket, file by file, with its type and a year of cache
# (the files never change: a new universe is a new folder). Usage: deploy/publish-universe.sh babel-1
set -euo pipefail
name="${1:?universe name, e.g. babel-1}"
bucket="${BUCKET:-babel-universos}"
root="$(cd "$(dirname "$0")/.." && pwd)/lab/universes/$name"
[ -f "$root/manifest.json" ] || { echo "no universe at $root" >&2; exit 1; }
cd "$root"
find . -type f ! -name '.*' | sed 's|^\./||' | sort | while read -r f; do
	case "$f" in
		*.js) type=text/javascript ;;
		*.json) type=application/json ;;
		*.wasm) type=application/wasm ;;
		*.wat) type=text/plain ;;
		*) type=application/octet-stream ;;
	esac
	echo "→ $name/$f ($type)"
	pnpm dlx wrangler r2 object put "$bucket/$name/$f" --remote --file "$f" \
		--content-type "$type" --cache-control "public, max-age=31536000, immutable"
done
