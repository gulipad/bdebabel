/**
 * The door to the model, for the places that use it (Buscar, a room, a page, Ir's chance). `need()` resolves
 * once they may go on. On a desktop the model just comes (a line says how much has arrived) and they go on at
 * once. On a phone or a tablet a popup (Door.svelte) first says what it weighs: they go on once it is in and
 * checked, or `need()` rejects if the reader says not now. When the model came on an earlier visit, nothing
 * is said at all. On a desktop, `early()` starts the download while the cover is still inking itself in.
 * It opens the universe of the language the reader is in (client.ts), and says what it says in it.
 */
import { lang } from '#lib/i18n.ts';
import { handheld } from '#lib/ui/device.ts';
import { arrived, universe, type Progress } from './client.ts';
import { ABSENT } from './protocol.ts';

/** why the model is needed, unless a place says why itself */
const WHY = { es: 'Para buscar y abrir páginas', en: 'To search and open pages' };

class Door {
	/** the popup: closed, asking, or showing the download */
	popup = $state<'closed' | 'ask' | 'coming'>('closed');
	why = $state('');
	progress = $state<Progress>({ stage: 'manifest', loaded: 0, total: 0 });
	error = $state('');
	/** the universe the reader asked for isn't published yet (the places that need it say so themselves) */
	absent = $state(false);
	#waiting: { resolve: () => void; reject: (e: Error) => void } | null = null;
	/** the universe whose download is being shown (a new one, after one fails) */
	#watching: ReturnType<typeof universe> | null = null;

	async need(why = WHY[lang()]): Promise<void> {
		if (await arrived()) {
			universe();
			return;
		}
		if (!handheld()) {
			// (if it can't come, the places that need it say so, and the door too)
			this.#start().catch(() => {});
			return;
		}
		this.why = why;
		this.error = '';
		this.popup = 'ask';
		return new Promise((resolve, reject) => (this.#waiting = { resolve, reject }));
	}

	/** on a desktop, the model starts coming at once, wherever the reader came in (a phone waits to be asked) */
	early() {
		if (!handheld()) this.#start().catch(() => {});
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
			this.absent = false;
			const off = u.onProgress((p) => (this.progress = p));
			u.ready.then(
				() => {
					off();
					this.progress = { stage: 'ready', loaded: 0, total: 0 };
				},
				(e: Error) => {
					off();
					this.error = e.message;
					this.absent = e.message === ABSENT;
				}
			);
		}
		return u.ready.then(() => undefined);
	}
}

export const door = new Door();
