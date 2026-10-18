<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import Loading from '#lib/components/Loading.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { melt, meltAway } from '#lib/ui/melt.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** the cover draws its own sheet over the whole screen, and leaves by melting away on its own */
	const onCover = $derived(page.route.id === '/' || page.route.id === '/portada');
	const WAYS = [
		{ name: 'Teoría', to: '/teoria' },
		{ name: 'Buscar', to: '/buscar' },
		{ name: 'Hojear', to: '/hojear' }
	] as const;
	const here = (to: string) => page.url.pathname.startsWith(to);

	let main = $state<HTMLElement>();
	// leaving an inner page, it melts away before the next one melts in
	onNavigate(async (nav) => {
		const from = nav.from?.route.id;
		// (only between pages: a choice within a page, which changes only the query, keeps it)
		if (
			!main ||
			from === '/' ||
			from === '/portada' ||
			nav.from?.url.pathname === nav.to?.url.pathname
		)
			return;
		await meltAway(main, 420);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>La Ciudad de Babel</title>
</svelte:head>

{#if onCover}
	{@render children()}
{:else}
	<Sheet />
	<div class="city">
		<header>
			<a href={resolve('/')} class="title">La Biblioteca de Babel</a>
			<nav>
				{#each WAYS as way (way.to)}
					<InkLink href={resolve(way.to)} current={here(way.to)} small>{way.name}</InkLink>
				{/each}
			</nav>
		</header>
		<Loading />
		{#key page.url.pathname}
			<main bind:this={main} use:melt={{ ms: 900 }}>
				{@render children()}
			</main>
		{/key}
	</div>
{/if}

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
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--rule);
	}
	.title {
		font-family: var(--display-sc);
		font-size: 1.15rem;
		letter-spacing: 0.2em;
		color: var(--ink);
		text-decoration: none;
	}
	nav {
		display: flex;
		gap: 0.6rem;
		margin-right: -0.35em;
	}
</style>
