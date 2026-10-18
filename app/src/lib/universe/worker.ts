/// <reference lib="webworker" />
/**
 * The engine worker: loads a frozen universe, checks every file against its manifest, and computes pages
 * off the main thread so the interface (and its ink) never waits on the model.
 */
import type {
	AddressModule,
	CodecModule,
	FastModule,
	Library,
	LibraryTables,
	Manifest,
	ModelIndex,
	Rings
} from './frozen';
import type {
	PageResult,
	Request,
	RoomResult,
	SearchPage,
	Stage,
	UniverseInfo,
	WorkerMessage
} from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const CACHE = 'ciudad-de-babel-universes';

interface Open {
	manifest: Manifest;
	library: Library;
	codec: CodecModule;
	address: AddressModule;
	key: Uint8Array;
	rings: Rings;
}
let universe: Open | null = null;

const post = (m: WorkerMessage) => self.postMessage(m);
const progress = (stage: Stage, loaded = 0, total = 0) =>
	post({ kind: 'progress', stage, loaded, total });

async function sha256(bytes: ArrayBuffer | Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The browser's cache for the universe's files, or null where there is none to have: it is only a saving, so
 * private windows (where opening it can throw) and full storage just mean downloading again next time.
 */
async function openCache(): Promise<Cache | null> {
	try {
		return 'caches' in self ? await caches.open(CACHE) : null;
	} catch {
		return null;
	}
}

/** Fetches a file of the universe (from the cache when we have it), streaming progress for large ones. */
async function fetchBytes(
	url: string,
	onProgress?: (loaded: number, total: number) => void
): Promise<Uint8Array> {
	const cache = await openCache();
	let res = (await cache?.match(url).catch(() => undefined)) ?? null;
	const cached = !!res;
	if (!res) {
		res = await fetch(url);
		if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	}
	const total = Number(res.headers.get('Content-Length') ?? 0);
	let out: Uint8Array;
	if (onProgress && res.body) {
		const reader = res.body.getReader();
		const parts: Uint8Array[] = [];
		let loaded = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			parts.push(value);
			loaded += value.length;
			onProgress(loaded, total);
		}
		out = new Uint8Array(loaded);
		let o = 0;
		for (const p of parts) {
			out.set(p, o);
			o += p.length;
		}
	} else out = new Uint8Array(await res.arrayBuffer());
	if (!cached)
		await cache?.put(url, new Response(out as BufferSource, { headers: res.headers })).catch(() => {
			// not kept (storage full or refused): the bytes are here all the same, and checked below
		});
	return out;
}

/** files of the universe served from somewhere else (the model, from Hugging Face): path → URL */
let elsewhere: Record<string, string> = {};

async function verified(
	base: string,
	rel: string,
	expected: string,
	onProgress?: (l: number, t: number) => void
) {
	const url = elsewhere[rel] ?? new URL(rel, base).href;
	const bytes = await fetchBytes(url, onProgress);
	const got = await sha256(bytes);
	if (got !== expected) {
		await (await openCache())?.delete(url).catch(() => false);
		throw new Error(
			`${rel} does not match the universe's manifest (expected ${expected.slice(0, 12)}…, got ${got.slice(0, 12)}…)`
		);
	}
	return bytes;
}

async function init(base: string): Promise<UniverseInfo> {
	progress('manifest');
	const manifest = (await (await fetch(new URL('manifest.json', base))).json()) as Manifest;
	const rings = (await (await fetch(new URL('rings.json', base))).json()) as Rings;
	const files = manifest.files;

	// The engine code: checked, then imported by URL exactly as frozen.
	progress('engine');
	for (const rel of Object.keys(files).filter(
		(f) => f.startsWith('engine/') && f.endsWith('.js')
	)) {
		await verified(base, rel, files[rel]);
	}
	const load = <T>(rel: string) => import(/* @vite-ignore */ new URL(rel, base).href) as Promise<T>;
	const [fast, codec, address] = await Promise.all([
		load<FastModule>('engine/fast.js'),
		load<CodecModule>('engine/codec.js'),
		load<AddressModule>('engine/address.js')
	]);

	// The model: 77 MB the first time, from the browser's cache after that.
	const modelBin = await verified(base, 'model/model.bin', files['model/model.bin'], (l, t) =>
		progress('model', l, t)
	);
	progress('verify');
	const [modelJson, wasm, tablesJson] = await Promise.all([
		verified(base, 'model/model.json', files['model/model.json']),
		verified(base, 'model/engine.wasm', files['model/engine.wasm']),
		verified(base, 'model/library.json', files['model/library.json'])
	]);
	const dec = new TextDecoder();
	const index = JSON.parse(dec.decode(modelJson)) as ModelIndex;
	const tables = JSON.parse(dec.decode(tablesJson)) as LibraryTables;
	const engine = await fast.fastEngine(modelBin, index, wasm);
	const library = new codec.Library(engine, tables, manifest.settings);
	universe = {
		manifest,
		library,
		codec,
		address,
		key: address.hexKey(manifest.scramble_key),
		rings
	};
	progress('ready');
	return {
		id: manifest.id,
		description: manifest.description,
		model: manifest.source_model.name ?? manifest.source_model.folder,
		pageChars: manifest.page_chars,
		rings: rings.rings
	};
}

function need(): Open {
	if (!universe) throw new Error('the universe is not open yet');
	return universe;
}

/** the size of a random room's numbers, in bits */
const ROOM_BITS = 4096;

const bitsOf = (n: bigint) => (n === 0n ? 0 : n.toString(2).length);

function ringOf(bits: number): string {
	for (const r of need().rings.rings) if (r.until === null || bits <= r.until) return r.name;
	return 'El Vacío';
}

/** The page at a number, under its canonical (shortest) address. */
async function pageAt(n: bigint): Promise<PageResult> {
	const u = need();
	const [text] = u.library.pageDecode(n);
	const c = u.library.pageEncode(text);
	const bits = bitsOf(c);
	return {
		address: await u.address.addressOf(u.manifest.id, u.key, c),
		text,
		bits,
		ring: ringOf(bits)
	};
}

async function handle(req: Request): Promise<unknown> {
	switch (req.type) {
		case 'init':
			elsewhere = req.elsewhere ?? {};
			return init(req.base);
		case 'center':
			return pageAt(0n);
		case 'random':
			return pageAt(need().codec.randomAddress(req.seed, need().library.PAGE));
		case 'room': {
			// a random location, without writing its page: only its hexagon is needed. Its number has ROOM_BITS,
			// comfortably more than a page's writing uses (~2,400), so every page in the room is written in full
			const u = need();
			const bytes = crypto.getRandomValues(new Uint8Array(ROOM_BITS / 8));
			bytes[0] |= 0x80;
			const n = BigInt('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
			const address = await u.address.addressOf(u.manifest.id, u.key, n);
			return { universe: u.manifest.id, hexagon: address.split(':')[1] } satisfies RoomResult;
		}
		case 'open': {
			const u = need();
			const n = await u.address.numberOf(u.manifest.id, u.key, req.address);
			const [text, left] = u.library.pageDecode(n);
			// the page's own distance, whatever the location: the bits its writing used (its canonical length)
			const bits = bitsOf(n) - bitsOf(left);
			return { address: req.address, text, bits, ring: ringOf(bits) } satisfies PageResult;
		}
		case 'search': {
			const u = need();
			const [query, removed] = u.codec.normalize(req.query, u.library.alphabet);
			const r = u.library.search(query, req.seed);
			const c = u.library.pageEncode(r.page);
			const bits = bitsOf(c);
			return {
				address: await u.address.addressOf(u.manifest.id, u.key, c),
				text: r.page,
				bits,
				ring: ringOf(bits),
				offset: r.offset,
				query,
				removed
			} satisfies SearchPage;
		}
	}
}

self.onmessage = async (e: MessageEvent<Request & { id: number }>) => {
	const { id, ...req } = e.data;
	try {
		post({ kind: 'reply', id, ok: true, result: await handle(req as Request) });
	} catch (err) {
		post({ kind: 'reply', id, ok: false, error: err instanceof Error ? err.message : String(err) });
	}
};
