import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

/** The frozen universes (engine, model, manifest) live in the lab, outside the app. */
const UNIVERSES = resolve(import.meta.dirname, '../lab/universes');

const TYPES: Record<string, string> = {
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.wasm': 'application/wasm',
	'.bin': 'application/octet-stream',
	'.wat': 'text/plain; charset=utf-8'
};

/**
 * Serves lab/universes/<id>/… at /universe/<id>/… in dev and preview, byte for byte: the app loads the frozen
 * engine and model from there and checks every file against the manifest. In production the build puts the
 * same tree next to the city (vercel.json), and the weights come from Hugging Face (VITE_MODEL_URL).
 */
function universes(): Plugin {
	const handler: Connect.NextHandleFunction = (req, res, next) => {
		const url = (req.url ?? '').split('?')[0];
		if (!url.startsWith('/universe/')) return next();
		const file = normalize(join(UNIVERSES, decodeURIComponent(url.slice('/universe/'.length))));
		if (!file.startsWith(UNIVERSES)) return next();
		let size: number;
		try {
			const st = statSync(file);
			if (!st.isFile()) return next();
			size = st.size;
		} catch {
			return next();
		}
		res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
		res.setHeader('Content-Length', String(size));
		res.setHeader('Cache-Control', 'no-cache');
		createReadStream(file).pipe(res);
	};
	return {
		name: 'babel-universes',
		configureServer: (server) => void server.middlewares.use(handler),
		configurePreviewServer: (server) => void server.middlewares.use(handler)
	};
}

/**
 * The temporary text editor's other half (lib/dev/TextEditor.svelte): in dev only, POST /__edits keeps what was
 * changed on a page in app/.edits/<name>.json, to be put into the source by hand.
 */
function edits(): Plugin {
	return {
		name: 'babel-edits',
		apply: 'serve',
		configureServer: (server) =>
			void server.middlewares.use('/__edits', (req, res) => {
				if (req.method !== 'POST') return void res.writeHead(405).end();
				let body = '';
				req.on('data', (c) => (body += c));
				req.on('end', () => {
					const { name } = JSON.parse(body) as { name: string };
					const dir = resolve(import.meta.dirname, '.edits');
					mkdirSync(dir, { recursive: true });
					writeFileSync(join(dir, `${name.replace(/[^a-z0-9-]/gi, '')}.json`), body);
					res.writeHead(200).end('ok');
				});
			})
	};
}

export default defineConfig({
	plugins: [
		universes(),
		edits(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Every page is computed on the reader's device: a static single-page app, no server.
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	worker: { format: 'es' },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
