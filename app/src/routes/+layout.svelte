<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import SoundToggle from '#lib/sound/SoundToggle.svelte';
	import Handheld from '#lib/ui/Handheld.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import Inks from '#lib/ui/Inks.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { melt, meltAway } from '#lib/ui/melt.ts';
	import { movedWithin } from '#lib/ui/visit.ts';
	import Door from '#lib/universe/Door.svelte';
	import { door } from '#lib/universe/door.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** the cover draws its own sheet over the whole screen, and leaves by melting away on its own */
	const onCover = $derived(page.route.id === '/');
	const WAYS = [
		{ name: 'Teoría', to: '/teoria' },
		{ name: 'Buscar', to: '/buscar' },
		{ name: 'Ir', to: '/ir' }
	] as const;
	const here = (to: string) => page.url.pathname.startsWith(to);
	/** the cover recorded for video (#video) has no switch in its corner */
	const recording = $derived(page.url.hash.includes('video'));

	/** the places that need the model: they open once the door lets them in (at once, on a desktop) */
	const NEEDS = ['/buscar', '/sala/[hexagon]', '/[address]'];
	const needs = $derived(NEEDS.includes(page.route.id ?? ''));
	let admitted = $state('');
	$effect(() => {
		const path = page.url.pathname;
		if (!needs) {
			// gone somewhere that doesn't need it: a popup left open for the last place closes
			if (untrack(() => door.popup) !== 'closed') door.notNow();
			return;
		}
		door.need().then(
			() => (admitted = path),
			// not now: back to the cover, unless the reader has already gone elsewhere
			() => {
				if (page.url.pathname === path) goto(resolve('/'));
			}
		);
	});

	/** back to the cover, always */
	const back = () => goto(resolve('/'));

	let main = $state<HTMLElement>();
	// leaving an inner page, it melts away before the next one melts in
	onNavigate(async (nav) => {
		movedWithin();
		// (only between pages: a choice within a page, which changes only the query, keeps it)
		if (!main || nav.from?.route.id === '/' || nav.from?.url.pathname === nav.to?.url.pathname)
			return;
		await meltAway(main, 420);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>La Ciudad de Babel</title>
</svelte:head>

<Inks />
<Handheld>
	{#if !recording}<SoundToggle />{/if}

	{#if onCover}
		{@render children()}
	{:else}
		<Sheet />
		<div class="city">
			<header>
				<InkLink small onclick={back}>‹ Atrás</InkLink>
				<nav>
					{#each WAYS as way (way.to)}
						<InkLink href={resolve(way.to)} current={here(way.to)} small>{way.name}</InkLink>
					{/each}
				</nav>
			</header>
			<Door />
			{#key page.url.pathname}
				<main bind:this={main} use:melt={{ ms: 900 }}>
					{#if !needs || admitted === page.url.pathname}
						{@render children()}
					{/if}
				</main>
			{/key}
		</div>
	{/if}
</Handheld>

<style>
	.city {
		max-width: 46rem;
		margin: 0 auto;
		padding-block: 1.6rem 5rem;
		padding-left: max(16px, env(safe-area-inset-left, 0px));
		padding-right: max(16px, env(safe-area-inset-right, 0px));
		display: flex;
		flex-direction: column;
		gap: 2.2rem;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem 1.2rem;
		align-items: baseline;
		justify-content: space-between;
	}
	/* every drawing in the city is inked by hand */
	.city :global(main svg),
	.city :global(main .inked) {
		filter: url(#ink-wobble);
	}
	nav {
		display: flex;
		gap: 0.6rem;
		margin-right: -0.35em;
	}
</style>
