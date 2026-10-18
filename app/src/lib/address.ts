/** Display helpers for addresses. The real arithmetic (scrambling, numbers) lives in the frozen engine. */

export interface Location {
	universe: string;
	hexagon: string;
	wall: number;
	shelf: number;
	volume: number;
	page: number;
}

/** Splits babel-1:<hexágono>:<muro>:<balda>:<volumen>:<página>; null if it is not shaped like one. */
export function locate(address: string): Location | null {
	const parts = address.trim().split(':');
	if (parts.length !== 6 || !/^[0-9A-Za-z]+$/.test(parts[1])) return null;
	const [wall, shelf, volume, page] = parts.slice(2).map(Number);
	const ok = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
	if (!ok(wall, 4) || !ok(shelf, 5) || !ok(volume, 32) || !ok(page, 410)) return null;
	return { universe: parts[0], hexagon: parts[1], wall, shelf, volume, page };
}

/** The address of a page in a room: babel-1:<hexágono>:<muro>:<balda>:<volumen>:<página>. */
export const addressIn = (
	universe: string,
	hexagon: string,
	wall: number,
	shelf: number,
	volume: number,
	page: number
) => [universe, hexagon, wall, shelf, volume, page].join(':');

/** A long hexagon name, shortened for reading: its first and last characters. */
export const brief = (hexagon: string, n = 6) =>
	hexagon.length <= n * 2 + 1 ? hexagon : `${hexagon.slice(0, n)}…${hexagon.slice(-n)}`;

/** The Library's measures (Borges's): 4 walls of shelves per room, 5 shelves, 32 books, 410 pages. */
export const WALLS = 4,
	SHELVES = 5,
	VOLUMES = 32,
	PAGES = 410;

/** Spanish thousands separator, as in "2.282 pasos". */
const ES = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });
export const steps = (n: number) => ES.format(n);

/** A fresh seed for the reader's random walk. */
export const seed = () => crypto.randomUUID();

/** A place in the Library, as far down as it was given: a room, and perhaps a wall, shelf, book and page. */
export interface Place {
	universe: string;
	hexagon: string;
	wall?: number;
	shelf?: number;
	volume?: number;
	page?: number;
	/** a sentence to mark, if a link carried one (?frase=) */
	phrase?: string;
}

const UNIVERSE = /^babel-[0-9a-z-]+$/;
const ROOM = /^[0-9A-Za-z]+$/;

/** A place as written, before any of it is checked. */
export interface PlaceParts {
	universe: string;
	hexagon: string;
	wall?: number;
	shelf?: number;
	volume?: number;
	page?: number;
	phrase?: string;
}

/**
 * Reads whatever someone has for a place, without judging it: a full address, an address cut short
 * (babel-1:<sala>:2:4), a room's name on its own, or the link to a room or a page, with or without its
 * query. Without a universe, it is `universe`. Null only when there is nothing there, or too many parts.
 */
export function placeParts(input: string, universe = 'babel-1'): PlaceParts | null {
	let text = input.trim();
	if (!text) return null;
	let query = new URLSearchParams();
	// a link: what matters is its path, and its query
	const link = text.match(/^(?:[a-z]+:\/\/[^/]+)?(\/[^?#\s]*)(\?[^#\s]*)?/i);
	if (link && (text.includes('://') || text.startsWith('/'))) {
		query = new URLSearchParams(link[2] ?? '');
		text = link[1];
	} else {
		const q = text.indexOf('?');
		if (q >= 0) [text, query] = [text.slice(0, q), new URLSearchParams(text.slice(q + 1))];
	}
	try {
		text = decodeURIComponent(text);
	} catch {
		/* left as it is */
	}
	text = text.replace(/\s+/g, '');
	const phrase = query.get('frase') || undefined;
	const n = (v: string | null | undefined) => (v ? Number(v) : undefined);
	// a room's link: /sala/<sala>?muro=…&balda=…&volumen=…&pagina=…
	const room = text.match(/(?:^|\/)sala\/([^/]+)\/?$/);
	if (room)
		return {
			universe,
			hexagon: room[1],
			wall: n(query.get('muro')),
			shelf: n(query.get('balda')),
			volume: n(query.get('volumen')),
			page: n(query.get('pagina')),
			phrase
		};
	// an address, whole or cut short, possibly the last part of a page's link
	const parts = text.replace(/^.*\//, '').split(':').filter(Boolean);
	if (parts.length > 1 && UNIVERSE.test(parts[0])) universe = parts.shift()!;
	if (!parts.length || parts.length > 5) return null;
	const [hexagon, wall, shelf, volume, page] = parts;
	return {
		universe,
		hexagon,
		wall: n(wall),
		shelf: n(shelf),
		volume: n(volume),
		page: n(page),
		phrase
	};
}

/** The characters a room's name can't have (it is written in letters without accents, and digits). */
export const strangers = (hexagon: string) =>
	[...new Set(hexagon.replace(/[0-9A-Za-z]/g, ''))].join('');

/** The measures each part of a place must fall within: name, largest value. */
export const MEASURES = [
	['wall', 'El muro', WALLS],
	['shelf', 'La balda', SHELVES],
	['volume', 'El volumen', VOLUMES],
	['page', 'La página', PAGES]
] as const;

/** A place that holds up: a room that can exist, and parts within their measures. Null if not. */
export function parsePlace(input: string, universe = 'babel-1'): Place | null {
	const p = placeParts(input, universe);
	if (!p || !ROOM.test(p.hexagon) || !UNIVERSE.test(p.universe)) return null;
	for (const [key, , max] of MEASURES) {
		const v = p[key];
		if (v !== undefined && !(Number.isInteger(v) && v >= 1 && v <= max)) return null;
	}
	return p;
}
