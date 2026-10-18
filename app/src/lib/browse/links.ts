/**
 * A page's link, with a sentence to mark in it (?frase=). The address doesn't remember the sentence that
 * was searched, since it is an ordinary page; a link can carry it, and the page then marks it.
 */
import { resolve } from '$app/paths';

export const withPhrase = (address: string, phrase = '') =>
	resolve('/[address]', { address }) + (phrase ? `?${new URLSearchParams({ frase: phrase })}` : '');

/** A room, and how far into it: a wall, a shelf on it, a book on the shelf, a page of the book. */
export function roomLink(
	hexagon: string,
	at: { wall?: number; shelf?: number; volume?: number; page?: number } = {}
) {
	const q = (
		[
			['muro', at.wall],
			['balda', at.shelf],
			['volumen', at.volume],
			['pagina', at.page]
		] as const
	).filter(([, v]) => v);
	const room = resolve('/sala/[hexagon]', { hexagon });
	return q.length ? `${room}?${new URLSearchParams(q.map(([k, v]) => [k, String(v)]))}` : room;
}
