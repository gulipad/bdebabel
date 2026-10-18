/** The interface's handle on the engine worker: typed requests, and loading progress for the opening ink. */
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

const BASE = import.meta.env.VITE_UNIVERSE_BASE ?? '/universe/babel-1/';
/** the model may live elsewhere (Hugging Face, in production): its URL, pinned to one commit */
const MODEL = import.meta.env.VITE_MODEL_URL as string | undefined;
const ELSEWHERE: Record<string, string> = MODEL ? { 'model/model.bin': MODEL } : {};
/** where the worker keeps the universe's files (worker.ts) */
const CACHE = 'ciudad-de-babel-universes';
let shared: Universe | null = null;

/** One worker for the whole app, opened on first use (which starts the model's download). */
export function universe(): Universe {
	shared ??= new Universe(BASE, ELSEWHERE);
	return shared;
}

/** Whether the worker is open already, or the model came on an earlier visit and waits in the cache. */
export async function arrived(): Promise<boolean> {
	if (shared) return true;
	try {
		const model = MODEL ?? new URL('model/model.bin', new URL(BASE, location.href)).href;
		return !!(await (await caches.open(CACHE)).match(model));
	} catch {
		return false;
	}
}
