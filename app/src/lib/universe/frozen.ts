/**
 * Types for the frozen engine files of a universe (lab/universes/<id>/engine/*.js). Those files are loaded
 * at run time exactly as frozen and checked against the manifest's SHA-256; they are never bundled or
 * rewritten, because any change to them would change which page lives at which address.
 */

/** The integer engine: one step of the model per token, bit-exact on any device. */
export interface Engine {
	readonly context: number;
	step(token: number): Int32Array;
}

/** model.json: where each array of model.bin starts, plus the blob's own hash. */
export type ModelIndex = Record<string, unknown> & { _sha256: string };

export interface FastModule {
	fastEngine(modelBytes: Uint8Array, index: ModelIndex, wasmBytes: Uint8Array): Promise<Engine>;
}

/** library.json: the trimmed vocabulary, token flags, writer alphabet and coder tables. */
export interface LibraryTables {
	alphabet: string;
	page_chars: number;
	[table: string]: unknown;
}

export interface SearchResult {
	page: string;
	/** where the query starts inside the page */
	offset: number;
	attempts: number;
	drafts: number;
	rejected: number;
	ess: number;
	plain?: boolean;
}

export interface Library {
	readonly PAGE: number;
	readonly alphabet: Set<string>;
	/** The page stored at number n: [text, bits left over]. */
	pageDecode(n: bigint, chars?: number): [string, bigint];
	/** The canonical number of a page: its shortest address. */
	pageEncode(text: string): bigint;
	search(query: string, seed: string, options?: { n?: number; bridge?: number }): SearchResult;
}

export interface CodecModule {
	Library: new (engine: Engine, tables: LibraryTables, settings: Settings) => Library;
	BABEL1: Settings;
	/** Queries: NFC, typographic variants mapped onto the alphabet; returns [text, characters removed]. */
	normalize(text: string, alphabet: Set<string>): [string, string];
	/** A random page number from a seed (babel-1's own rule). */
	randomAddress(seed: string, chars?: number): bigint;
}

export type Settings = Record<string, number | number[]>;

export interface AddressModule {
	hexKey(hex: string): Uint8Array;
	addressOf(uid: string, key: Uint8Array, n: bigint): Promise<string>;
	numberOf(uid: string, key: Uint8Array, address: string): Promise<bigint>;
	formatLocation(uid: string, loc: bigint): string;
	parseLocation(address: string): [string, bigint];
}

/** manifest.json of a frozen universe. */
export interface Manifest {
	id: string;
	description: string;
	frozen: string;
	source_model: { name?: string; folder: string; sha256: string };
	engine: string;
	codec: string;
	address: string;
	page_chars: number;
	settings: Settings;
	scramble_key: string;
	files: Record<string, string>;
	fixtures: Fixture[];
}

export interface Fixture {
	kind: 'center' | 'random' | 'search';
	address: string;
	sha256: string;
	bits: number;
	number?: string;
	seed?: string;
	query?: string;
	text_start?: string;
}

/** rings.json: the named distances from the center. */
export interface Rings {
	universe: string;
	percentiles: Record<string, number>;
	rings: { name: string; until: number | null }[];
}
