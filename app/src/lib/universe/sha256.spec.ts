import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Sha256 } from './sha256.ts';

const reference = (d: Uint8Array) => createHash('sha256').update(d).digest('hex');

describe('Sha256', () => {
	it('matches the standard digests of the empty string and "abc"', () => {
		expect(new Sha256().hex()).toBe(
			'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
		);
		expect(new Sha256().update(new TextEncoder().encode('abc')).hex()).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});

	it('gives the same digest however the data is cut into pieces', () => {
		const data = new Uint8Array(100_003).map((_, i) => (i * 2654435761) >>> 24);
		for (const piece of [1, 7, 63, 64, 65, 1000, 65536]) {
			const h = new Sha256();
			for (let i = 0; i < data.length; i += piece) h.update(data.subarray(i, i + piece));
			expect(h.hex()).toBe(reference(data));
		}
	});

	it("checks the universe's own library file as its manifest does", () => {
		const root = new URL('../../../../lab/universes/babel-1/', import.meta.url);
		const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
		const bytes = new Uint8Array(readFileSync(new URL('model/library.json', root)));
		expect(new Sha256().update(bytes).hex()).toBe(manifest.files['model/library.json']);
	});
});
