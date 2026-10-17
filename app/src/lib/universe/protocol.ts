/** Messages between the interface and the engine worker. */

export interface PageResult {
	/** the page's full address, e.g. babel-1:<hexágono>:<muro>:<anaquel>:<volumen>:<página> */
	address: string;
	text: string;
	/** distance from the center: the length of the page's number in bits */
	bits: number;
	/** the ring that distance falls in ("el centro", "los barrios", …) */
	ring: string;
}

export interface SearchPage extends PageResult {
	/** where the query starts in the page */
	offset: number;
	/** the query as searched, after cleaning */
	query: string;
	/** characters the alphabet cannot write, removed from the query */
	removed: string;
}

export interface UniverseInfo {
	id: string;
	description: string;
	model: string;
	pageChars: number;
	rings: { name: string; until: number | null }[];
}

export type Request =
	| { type: 'init'; base: string }
	| { type: 'open'; address: string }
	| { type: 'random'; seed: string }
	| { type: 'search'; query: string; seed: string }
	| { type: 'center' };

export type ResultOf<R extends Request> = R extends { type: 'init' }
	? UniverseInfo
	: R extends { type: 'search' }
		? SearchPage
		: PageResult;

export type Stage = 'manifest' | 'engine' | 'model' | 'verify' | 'ready';

export type WorkerMessage =
	| { kind: 'reply'; id: number; ok: true; result: unknown }
	| { kind: 'reply'; id: number; ok: false; error: string }
	| { kind: 'progress'; stage: Stage; loaded: number; total: number };
