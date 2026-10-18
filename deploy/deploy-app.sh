#!/usr/bin/env bash
# Builds the city, puts the universe it reads next to it (same origin: /universe/<name>/) except the model,
# which is served from Hugging Face (VITE_MODEL_URL in app/.env.production), and deploys the whole thing to
# Vercel as static files (config in app/static/vercel.json). Usage: deploy/deploy-app.sh [babel-1]
set -euo pipefail
name="${1:-babel-1}"
root="$(cd "$(dirname "$0")/.." && pwd)"
universe="$root/lab/universes/$name"
[ -f "$universe/manifest.json" ] || { echo "no universe at $universe" >&2; exit 1; }
cd "$root/app"
pnpm build
mkdir -p "build/universe/$name"
# the model goes too, unless it is served from elsewhere
if grep -q '^VITE_MODEL_URL=.' .env.production 2>/dev/null; then
	rsync -a --exclude 'model/model.bin' "$universe/" "build/universe/$name/"
else
	[ -f "$universe/model/model.bin" ] || { echo "the model isn't here: deploy/fetch-universe.sh $name" >&2; exit 1; }
	rsync -a "$universe/" "build/universe/$name/"
fi
cd build
pnpm dlx vercel link --yes --project babel --scope gulipads-projects
pnpm dlx vercel deploy --prod --yes --scope gulipads-projects
