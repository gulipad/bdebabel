/**
 * A page's link, with a sentence to mark in it (?frase=, or ?phrase= in English). The address doesn't remember
 * the sentence that was searched, since it is an ordinary page; a link can carry it, and the page then marks it.
 */
import { KEYS, lang as current, pagePath, roomPath, type Lang } from '#lib/i18n.ts';

export const withPhrase = (address: string, phrase = '', lang: Lang = current()) =>
	pagePath(address, lang) +
	(phrase ? `?${new URLSearchParams({ [KEYS[lang].phrase]: phrase })}` : '');

/** A room, and how far into it: a wall, a shelf on it, a book on the shelf, a page of the book. */
export function roomLink(
	hexagon: string,
	at: { wall?: number; shelf?: number; volume?: number; page?: number } = {},
	lang: Lang = current()
) {
	const keys = KEYS[lang];
	const q = (
		[
			[keys.wall, at.wall],
			[keys.shelf, at.shelf],
			[keys.volume, at.volume],
			[keys.page, at.page]
		] as const
	).filter(([, v]) => v);
	const room = roomPath(hexagon, lang);
	return q.length ? `${room}?${new URLSearchParams(q.map(([k, v]) => [k, String(v)]))}` : room;
}
