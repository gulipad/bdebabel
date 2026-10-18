<script lang="ts">
	import '../app.css';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import InkLink from '#lib/ui/InkLink.svelte';
	import SoundToggle from '#lib/sound/SoundToggle.svelte';
	import { handheld } from '#lib/ui/device.ts';
	import Handheld from '#lib/ui/Handheld.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { melt, meltAway } from '#lib/ui/melt.ts';
	import { movedWithin } from '#lib/ui/visit.ts';
	import Librarian from '#lib/universe/Librarian.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** the cover draws its own sheet over the whole screen, and leaves by melting away on its own */
	const onCover = $derived(page.route.id === '/' || page.route.id === '/portada');
	const WAYS = [
		{ name: 'Teoría', to: '/teoria' },
		{ name: 'Buscar', to: '/buscar' },
		{ name: 'Ir', to: '/ir' }
	] as const;
	/** the cover recorded for video (#video) has no switch in its corner */
	const recording = $derived(page.url.hash.includes('video'));
	/** the places that need the model: they open only once it has come (Librarian) */
	const NEEDS = ['/buscar', '/sala/[hexagon]', '/[address]'];
	const needs = $derived(NEEDS.includes(page.route.id ?? ''));

	/** on a phone or a tablet, a word first that the city is made for a desktop (once) */
	const WARNED = 'babel:movil';
	function wasWarned() {
		try {
			return !handheld() || localStorage.getItem(WARNED) === '1';
		} catch {
			return !handheld();
		}
	}
	let warned = $state(wasWarned());
	function goIn() {
		warned = true;
		try {
			localStorage.setItem(WARNED, '1');
		} catch {
			// asked again next time, then
		}
	}

	const here = (to: string) => page.url.pathname.startsWith(to);

	/** back to the cover, always */
	const back = () => goto(resolve('/'));

	let main = $state<HTMLElement>();
	// leaving an inner page, it melts away before the next one melts in
	onNavigate(async (nav) => {
		movedWithin();
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

<!--
	The pen's hand, as on the cover: every drawing's edges shifted by a fine noise field (ink-wobble, the
	cover's feTurbulence + feDisplacementMap), or by a coarser one for stains (ink-stain).
-->
<svg class="inks" aria-hidden="true">
	<filter id="ink-wobble" x="-2%" y="-2%" width="104%" height="104%">
		<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="21" result="n" />
		<feDisplacementMap
			in="SourceGraphic"
			in2="n"
			scale="2.4"
			xChannelSelector="R"
			yChannelSelector="G"
		/>
	</filter>
	<filter id="ink-stain" x="-8%" y="-8%" width="116%" height="116%">
		<feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="7" result="n" />
		<feDisplacementMap
			in="SourceGraphic"
			in2="n"
			scale="14"
			xChannelSelector="R"
			yChannelSelector="G"
			result="d"
		/>
		<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="3" result="f" />
		<feDisplacementMap in="d" in2="f" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
	</filter>
</svg>
{#if !warned && !recording}
	<Handheld oncontinue={goIn} />
{:else}
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
			{#key page.url.pathname}
				<main bind:this={main} use:melt={{ ms: 900 }}>
					{#if needs}
						<Librarian>{@render children()}</Librarian>
					{:else}
						{@render children()}
					{/if}
				</main>
			{/key}
		</div>
	{/if}
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
	}
	.inks {
		position: absolute;
		width: 0;
		height: 0;
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
