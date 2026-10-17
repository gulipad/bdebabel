import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { locate } from '#lib/address.ts';
import type {
	AddressModule,
	CodecModule,
	FastModule,
	LibraryTables,
	Manifest,
	ModelIndex
} from './frozen';

const DIR = resolve(import.meta.dirname, '../../../../lab/universes/babel-1');
const manifest = JSON.parse(readFileSync(resolve(DIR, 'manifest.json'), 'utf8')) as Manifest;
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const load = <T>(rel: string) =>
	import(/* @vite-ignore */ pathToFileURL(resolve(DIR, rel)).href) as Promise<T>;

describe('babel-1, as the app loads it', () => {
	it('engine files match the manifest byte for byte', () => {
		const engine = Object.entries(manifest.files).filter(([f]) => f.startsWith('engine/'));
		expect(engine.length).toBeGreaterThan(0);
		for (const [rel, h] of engine) expect(sha(readFileSync(resolve(DIR, rel))), rel).toBe(h);
	});

	it('the frozen address code reproduces every fixture address', async () => {
		const A = await load<AddressModule>('engine/address.js');
		const key = A.hexKey(manifest.scramble_key);
		for (const f of manifest.fixtures) {
			expect(locate(f.address), f.address).not.toBeNull();
			const n = await A.numberOf(manifest.id, key, f.address);
			expect(await A.addressOf(manifest.id, key, n)).toBe(f.address);
			expect(n === 0n ? 0 : n.toString(2).length).toBe(f.bits);
		}
	});

	const model = resolve(DIR, 'model/model.bin');
	it.skipIf(!existsSync(model))(
		'the center page reproduces exactly (needs the model on disk)',
		async () => {
			const [fast, codec] = await Promise.all([
				load<FastModule>('engine/fast.js'),
				load<CodecModule>('engine/codec.js')
			]);
			const file = (rel: string) => readFileSync(resolve(DIR, rel));
			const engine = await fast.fastEngine(
				new Uint8Array(file('model/model.bin')),
				JSON.parse(file('model/model.json').toString()) as ModelIndex,
				new Uint8Array(file('model/engine.wasm'))
			);
			const lib = new codec.Library(
				engine,
				JSON.parse(file('model/library.json').toString()) as LibraryTables,
				manifest.settings
			);
			const [text] = lib.pageDecode(0n);
			const center = manifest.fixtures.find((f) => f.kind === 'center')!;
			expect(sha(text)).toBe(center.sha256);
		},
		60_000
	);
});
