/**
 * The door to the model, for the places that use it (Buscar, a room, a page, Ir's chance). `need()` resolves
 * once they may go on. On a desktop the model just comes (a line says how much has arrived) and they go on at
 * once. On a phone or a tablet a popup (Door.svelte) first says what it weighs: they go on once it is in and
 * checked, or `need()` rejects if the reader says not now. When the model came on an earlier visit, nothing
 * is said at all.
 */
import { handheld } from '#lib/ui/device.ts';
import { arrived, universe, type Progress } from './client.ts';

class Door {
	/** the popup: closed, asking, or showing the download */
	popup = $state<'closed' | 'ask' | 'coming'>('closed');
	why = $state('');
	progress = $state<Progress>({ stage: 'manifest', loaded: 0, total: 0 });
	error = $state('');
	#waiting: { resolve: () => void; reject: (e: Error) => void } | null = null;
	/** the universe whose download is being shown (a new one, after one fails) */
	#watching: ReturnType<typeof universe> | null = null;

	async need(why = 'Para buscar y abrir páginas'): Promise<void> {
		if (await arrived()) {
			universe();
			return;
		}
		if (!handheld()) {
			this.#start();
			return;
		}
		this.why = why;
		this.error = '';
		this.popup = 'ask';
		return new Promise((resolve, reject) => (this.#waiting = { resolve, reject }));
	}

	/** the popup's Descargar */
	come() {
		this.popup = 'coming';
		this.error = '';
		this.#start().then(
			() => {
				this.popup = 'closed';
				this.#waiting?.resolve();
				this.#waiting = null;
			},
			(e: Error) => {
				this.error = e.message;
				this.popup = 'ask';
			}
		);
	}

	/** the popup's Ahora no */
	notNow() {
		this.popup = 'closed';
		this.#waiting?.reject(new Error('not now'));
		this.#waiting = null;
	}

	#start() {
		const u = universe();
		if (this.#watching !== u) {
			this.#watching = u;
			this.error = '';
			const off = u.onProgress((p) => (this.progress = p));
			u.ready.then(
				() => {
					off();
					this.progress = { stage: 'ready', loaded: 0, total: 0 };
				},
				(e: Error) => {
					off();
					this.error = e.message;
				}
			);
		}
		return u.ready.then(() => undefined);
	}
}

export const door = new Door();
