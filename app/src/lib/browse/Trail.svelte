<script lang="ts">
	/** Where a page is, every step a way there: its room, wall, shelf, book, and its place in the book. */
	import { brief, type Location } from '#lib/address.ts';
	import { roomLink } from '#lib/browse/links.ts';

	let { where }: { where: Location } = $props();
	const h = $derived(where.hexagon);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- roomLink() resolves the route -->
<nav class="trail" aria-label="Dónde está">
	<a href={roomLink(h)}>Sala {brief(h)}</a><span>›</span>
	<a href={roomLink(h, { wall: where.wall })}>Muro {where.wall}</a><span>›</span>
	<a href={roomLink(h, { wall: where.wall, shelf: where.shelf })}>Balda {where.shelf}</a><span
		>›</span
	>
	<a href={roomLink(h, { wall: where.wall, shelf: where.shelf, volume: where.volume })}
		>Volumen {where.volume}</a
	><span>›</span>
	<a
		href={roomLink(h, {
			wall: where.wall,
			shelf: where.shelf,
			volume: where.volume,
			page: where.page
		})}>Página {where.page}</a
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
