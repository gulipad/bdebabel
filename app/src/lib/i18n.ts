/**
 * The Library in two languages: Spanish, at the city's own addresses (/, /teoria, /buscar, /ir, /sala/…), and
 * English under /en (/en/theory, /en/search, /en/browse, /en/room/…). Each is a universe of its own, ordered by its
 * own Librarian, so a page's address belongs to one of them only. Every place speaks the language of the
 * address it is at, and its links stay in it.
 */
import { resolve } from '$app/paths';
import { page } from '$app/state';
import { ABSENT } from '#lib/universe/protocol.ts';

export type Lang = 'es' | 'en';
export const LANGS: readonly Lang[] = ['es', 'en'];

/** the language of a path: English under /en, Spanish everywhere else */
export const langOf = (pathname: string): Lang => (/^\/en(\/|$)/.test(pathname) ? 'en' : 'es');
/** the language of the place the reader is at */
export const lang = (): Lang => langOf(page.url.pathname);

/** how numbers are written: 2.282 pasos, 2,282 steps */
export const LOCALE: Record<Lang, string> = { es: 'es-ES', en: 'en-GB' };

/** the places every page can lead to, by what they are */
export type Way = 'cover' | 'theory' | 'search' | 'go';

/** a place's path, in a language */
export function pathTo(way: Way, l: Lang = lang()): string {
	if (l === 'en')
		return way === 'cover'
			? resolve('/en')
			: way === 'theory'
				? resolve('/en/theory')
				: way === 'search'
					? resolve('/en/search')
					: resolve('/en/browse');
	return way === 'cover'
		? resolve('/')
		: way === 'theory'
			? resolve('/teoria')
			: way === 'search'
				? resolve('/buscar')
				: resolve('/ir');
}

/** a room's path, in a language */
export const roomPath = (hexagon: string, l: Lang = lang()) =>
	l === 'en' ? resolve('/en/room/[hexagon]', { hexagon }) : resolve('/sala/[hexagon]', { hexagon });

/** a page's path, in a language */
export const pagePath = (address: string, l: Lang = lang()) =>
	l === 'en' ? resolve('/en/[address]', { address }) : resolve('/[address]', { address });

/** the words a room's link (and a page's, for its sentence) carries its query in */
export const KEYS = {
	es: { wall: 'muro', shelf: 'balda', volume: 'volumen', page: 'pagina', phrase: 'frase' },
	en: { wall: 'wall', shelf: 'shelf', volume: 'volume', page: 'page', phrase: 'phrase' }
} as const;

/** the routes of each place, in both languages */
const PLACES: Record<string, Way> = {
	'/': 'cover',
	'/en': 'cover',
	'/teoria': 'theory',
	'/en/theory': 'theory',
	'/buscar': 'search',
	'/en/search': 'search',
	'/ir': 'go',
	'/en/browse': 'go'
};

/**
 * Where the same place is in the other language. A room or a page has none (the other universe has other rooms),
 * so from one it is the other language's way to an address; from somewhere unknown, its cover.
 */
export function counterpart(routeId: string | null, to: Lang): string {
	const way: Way = routeId === null ? 'cover' : (PLACES[routeId] ?? 'go');
	return pathTo(way, to);
}

/** What every part of the city says alike. */
export const COMMON = {
	es: {
		library: 'La Biblioteca de Babel',
		ways: { theory: 'Teoría', search: 'Buscar', go: 'Ir' },
		back: '‹ Atrás',
		copy: 'Copiar el enlace',
		copied: 'Copiado',
		room: 'Sala',
		wall: 'Muro',
		shelf: 'Balda',
		volume: 'Volumen',
		page: 'Página',
		absent: 'Esta biblioteca aún no está aquí: su universo todavía no se ha publicado.'
	},
	en: {
		library: 'The Library of Babel',
		ways: { theory: 'Theory', search: 'Search', go: 'Browse' },
		back: '‹ Back',
		copy: 'Copy the link',
		copied: 'Copied',
		room: 'Room',
		wall: 'Wall',
		shelf: 'Shelf',
		volume: 'Volume',
		page: 'Page',
		absent:
			"The English Library isn't here yet: its universe hasn't been published. The cover and the theory are open; searching and opening pages will work once it is."
	}
} as const;

/** what the reader is told of an error from the universe: in their language when it is one the city knows */
export const explain = (e: unknown, l: Lang = lang()) => {
	const message = e instanceof Error ? e.message : String(e);
	return message === ABSENT ? COMMON[l].absent : message;
};
