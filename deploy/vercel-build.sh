#!/usr/bin/env bash
# Vercel's build (vercel.json's buildCommand, from the repository root): the city, then every universe's small files
# beside it (their weights come from Hugging Face; see app/.env.production).
set -euo pipefail
cd app
npx --yes pnpm@10.29.3 build
for u in babel-1 babel-en-1; do
	mkdir -p "build/universe/$u"
	cp -R "../lab/universes/$u/." "build/universe/$u/"
done
