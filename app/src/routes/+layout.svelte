<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
	import { goto, onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { COMMON, lang, langOf, pathTo } from '#lib/i18n.ts';
	import SoundToggle from '#lib/sound/SoundToggle.svelte';
	import Handheld from '#lib/ui/Handheld.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import Inks from '#lib/ui/Inks.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { melt, meltAway } from '#lib/ui/melt.ts';
	import { movedWithin } from '#lib/ui/visit.ts';
	import Door from '#lib/universe/Door.svelte';
	import { door } from '#lib/universe/door.svelte.ts';
	import englishMeta from '#lib/english-meta.json';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	/** the language of the place the reader is at, and what every page says alike in it */
	const l = $derived(lang());
	const c = $derived(COMMON[l]);

	/** the covers (one in each language) */
	const COVERS = ['/', '/en'];
	/** the cover draws its own sheet over the whole screen, and leaves by melting away on its own */
	const onCover = $derived(COVERS.includes(page.route.id ?? ''));
	const WAYS = ['theory', 'search', 'go'] as const;
	const here = (to: string) => page.url.pathname.startsWith(to);
	/** the cover recorded for video (#video) has no switch in its corner */
	const recording = $derived(page.url.hash.includes('video'));

	/** the places that need the model: they open once the door lets them in (at once, on a desktop) */
	const NEEDS = [
		'/buscar',
		'/sala/[hexagon]',
		'/[address]',
		'/en/search',
		'/en/room/[hexagon]',
		'/en/[address]'
	];
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
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- pathTo() resolves the route
				if (page.url.pathname === path) goto(pathTo('cover', langOf(path)));
			}
		);
	});

	// on a desktop, the model downloads while the cover inks itself in: once the page itself has loaded, so it
	// doesn't hold back the cover's fonts and first strokes
	$effect(() => {
		let t = 0;
		const go = () => (t = window.setTimeout(() => door.early(), 600));
		if (document.readyState === 'complete') go();
		else addEventListener('load', go, { once: true });
		return () => {
			clearTimeout(t);
			removeEventListener('load', go);
		};
	});

	/** back to the cover, always (the one in the reader's language) */
	// eslint-disable-next-line svelte/no-navigation-without-resolve -- pathTo() resolves the route
	const back = () => goto(pathTo('cover', l));

	// the page says which language it is in, and so do the words a link to it is shared with (for the readers
	// that run the city's script; link previews, which don't, get them from en.html, made from the same file by
	// deploy/english-head.mjs)
	const ENGLISH_META: Record<string, string> = englishMeta;
	$effect(() => {
		document.documentElement.lang = l;
		for (const [key, english] of Object.entries(ENGLISH_META)) {
			const m = document.head.querySelector<HTMLMetaElement>(
				`meta[name="${key}"], meta[property="${key}"]`
			);
			if (!m) continue;
			// (app.html's own words are kept on the tag, to be put back on coming back to Spanish)
			m.dataset.es ??= m.content;
			m.content = l === 'en' ? english : m.dataset.es;
		}
	});

	let main = $state<HTMLElement>();
	// leaving an inner page, it melts away before the next one melts in
	onNavigate(async (nav) => {
		movedWithin();
		// (only between pages: a choice within a page, which changes only the query, keeps it)
		if (
			!main ||
			COVERS.includes(nav.from?.route.id ?? '') ||
			nav.from?.url.pathname === nav.to?.url.pathname
		)
			return;
		await meltAway(main, 420);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{c.library}</title>
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
				<InkLink small onclick={back}>{c.back}</InkLink>
				<div class="end">
					<nav>
						{#each WAYS as way (way)}
							{@const to = pathTo(way, l)}
							<InkLink href={to} current={here(to)} small>{c.ways[way]}</InkLink>
						{/each}
					</nav>
				</div>
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
	.end {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem 1.4rem;
	}
	nav {
		display: flex;
		gap: 0.6rem;
	}
</style>
