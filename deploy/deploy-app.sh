#!/usr/bin/env bash
# Builds the city against the published universe and uploads it as a static Worker (app/wrangler.jsonc).
set -euo pipefail
cd "$(dirname "$0")/../app"
pnpm build
pnpm dlx wrangler deploy
