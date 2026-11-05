<script lang="ts">
	/** Where a page is, every step a way there: its room, wall, shelf, book, and its place in the book. */
	import { brief, type Location } from '#lib/address.ts';
	import { roomLink } from '#lib/browse/links.ts';
	import { COMMON, lang } from '#lib/i18n.ts';

	let { where }: { where: Location } = $props();
	const h = $derived(where.hexagon);
	const c = COMMON[lang()];
	const WHERE = { es: 'Dónde está', en: 'Where it is' };
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- roomLink() resolves the route -->
<nav class="trail" aria-label={WHERE[lang()]}>
	<a href={roomLink(h)}>{c.room} {brief(h)}</a><span>›</span>
	<a href={roomLink(h, { wall: where.wall })}>{c.wall} {where.wall}</a><span>›</span>
	<a href={roomLink(h, { wall: where.wall, shelf: where.shelf })}>{c.shelf} {where.shelf}</a><span
		>›</span
	>
	<a href={roomLink(h, { wall: where.wall, shelf: where.shelf, volume: where.volume })}
		>{c.volume} {where.volume}</a
	><span>›</span>
	<a
		href={roomLink(h, {
			wall: where.wall,
			shelf: where.shelf,
			volume: where.volume,
			page: where.page
		})}>{c.page} {where.page}</a
	>
</nav>

<!-- eslint-enable svelte/no-navigation-without-resolve -->

<style>
	.trail {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.55rem;
		font: italic 0.98rem var(--display);
		color: var(--ink-faint);
	}
	a {
		color: var(--ink-dry);
	}
	a:hover {
		color: var(--madder);
	}
</style>
