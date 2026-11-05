/** The interface's handle on the engine worker: typed requests, and the model's download progress for the door. */
import { lang, LANGS, type Lang } from '#lib/i18n.ts';
import type { Rings } from './frozen';
import type { Request, ResultOf, Stage, UniverseInfo, WorkerMessage } from './protocol';

export type Progress = { stage: Stage; loaded: number; total: number };

export class Universe {
	private worker: Worker;
	private next = 1;
	private pending = new Map<
		number,
		{ resolve: (v: unknown) => void; reject: (e: Error) => void }
	>();
	private listeners = new Set<(p: Progress) => void>();
	readonly ready: Promise<UniverseInfo>;
	/** what its manifest says of it, once it is open */
	info: UniverseInfo | null = null;
	/** the universe couldn't be opened (the download or a check failed): a new one must be started to retry */
	failed = false;

	constructor(base: string, elsewhere: Record<string, string> = {}) {
		this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
			const m = e.data;
			if (m.kind === 'progress') {
				for (const l of this.listeners) l({ stage: m.stage, loaded: m.loaded, total: m.total });
				return;
			}
			const p = this.pending.get(m.id);
			if (!p) return;
			this.pending.delete(m.id);
			if (m.ok) p.resolve(m.result);
			else p.reject(new Error(m.error));
		};
		this.ready = this.ask({ type: 'init', base: new URL(base, location.href).href, elsewhere });
		this.ready.then(
			(info) => (this.info = info),
			() => (this.failed = true)
		);
	}

	/** stops the worker; whatever was still asked of it fails */
	close() {
		this.worker.terminate();
		for (const p of this.pending.values()) p.reject(new Error('closed'));
		this.pending.clear();
	}

	onProgress(fn: (p: Progress) => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	ask<R extends Request>(req: R): Promise<ResultOf<R>> {
		const id = this.next++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
			this.worker.postMessage({ id, ...req });
		});
	}

	open = (address: string) => this.ready.then(() => this.ask({ type: 'open', address }));
	random = (seed: string) => this.ready.then(() => this.ask({ type: 'random', seed }));
	room = (seed: string) => this.ready.then(() => this.ask({ type: 'room', seed }));
	search = (query: string, seed: string) =>
		this.ready.then(() => this.ask({ type: 'search', query, seed }));
	center = () => this.ready.then(() => this.ask({ type: 'center' }));
}

/**
 * Each language's universe: where its files are served, where its model lives (Hugging Face, in production:
 * its URL, pinned to one commit), and what the model weighs, for the door's popup.
 */
const UNIVERSES: Record<Lang, { base: string; model?: string; mb: number }> = {
	es: {
		base: import.meta.env.VITE_UNIVERSE_BASE ?? '/universe/babel-1/',
		model: import.meta.env.VITE_MODEL_URL as string | undefined,
		mb: 77
	},
	en: {
		base: import.meta.env.VITE_UNIVERSE_BASE_EN ?? '/universe/babel-en-1/',
		model: import.meta.env.VITE_MODEL_URL_EN as string | undefined,
		mb: 77
	}
};
const elsewhere = (l: Lang): Record<string, string> => {
	const model = UNIVERSES[l].model;
	return model ? { 'model/model.bin': model } : {};
};
/** where the worker keeps the universe's files (worker.ts) */
const CACHE = 'ciudad-de-babel-universes';
/** the one universe open, and its language: opening the other language's closes it, so only one model is held */
let shared: { lang: Lang; u: Universe } | null = null;

/**
 * One worker for the language the reader is in, opened on first use (which starts its model's download), and
 * again after one fails. A language's model is only ever downloaded for that language's pages.
 */
export function universe(l: Lang = lang()): Universe {
	if (shared && (shared.u.failed || shared.lang !== l)) {
		shared.u.close();
		shared = null;
	}
	shared ??= { lang: l, u: new Universe(UNIVERSES[l].base, elsewhere(l)) };
	return shared.u;
}

/** Whether the language's worker is open already, or its model came on an earlier visit and waits in the cache. */
export async function arrived(l: Lang = lang()): Promise<boolean> {
	if (shared && shared.lang === l && !shared.u.failed) return true;
	try {
		const { model, base } = UNIVERSES[l];
		const url = model ?? new URL('model/model.bin', new URL(base, location.href)).href;
		return !!(await (await caches.open(CACHE)).match(url));
	} catch {
		return false;
	}
}

/** what a language's model weighs, in MB */
export const modelMB = (l: Lang = lang()) => UNIVERSES[l].mb;

/**
 * A language's universe id (babel-1, babel-en-1), as its addresses start: its manifest's, once it is open, and
 * until then its folder's name, which is the same.
 */
export function universeId(l: Lang = lang()): string {
	if (shared?.lang === l && shared.u.info) return shared.u.info.id;
	return UNIVERSES[l].base.split('/').filter(Boolean).at(-1)!;
}

/** the language whose universe an address belongs to, if it is one of the city's */
export const langOfUniverse = (id: string): Lang | undefined =>
	LANGS.find((l) => universeId(l) === id);

/**
 * A language's rings (their names and where they end), for the drawings: the open universe's, when it is that
 * language's (on a desktop it opens as the city does), or else read from its rings.json without opening it;
 * null if the universe isn't there.
 */
export async function ringsOf(l: Lang): Promise<UniverseInfo['rings'] | null> {
	if (shared?.lang === l) return shared.u.ready.then((info) => info.rings).catch(() => null);
	try {
		const res = await fetch(new URL('rings.json', new URL(UNIVERSES[l].base, location.href)));
		if (!res.ok) return null;
		return ((await res.json()) as Rings).rings;
	} catch {
		return null;
	}
}
