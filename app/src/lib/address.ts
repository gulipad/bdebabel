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
