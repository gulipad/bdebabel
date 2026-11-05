<script lang="ts">
	/**
	 * The Library's two languages, ES · EN: the one the reader is in, and a way to the same place in the other
	 * (i18n.ts's counterpart: a room or a page leads to the other's way to an address, as their universes differ).
	 * Only on the cover, in the corner by the music's switch, where the cover melts away before going (`onpick`).
	 * Picking one is remembered (babel:lang), and the cover then opens in it rather than in the browser's language
	 * (app.html).
	 */
	import { page } from '$app/state';
	import { counterpart, lang, LANGS } from '#lib/i18n.ts';

	let {
		corner = false,
		onpick
	}: {
		/** fixed in the corner, beside the music's switch (the cover's place for it) */
		corner?: boolean;
		/** takes the way itself (the cover, which melts away first) instead of the link */
		onpick?: (href: string) => void;
	} = $props();

	const NAMES = { es: 'Español', en: 'English' };
	const LABEL = { es: 'Idioma', en: 'Language' };
	const here = $derived(lang());
</script>

<nav class="langs" class:corner aria-label={LABEL[here]}>
	{#each LANGS as l, i (l)}
		{#if i}<span class="dot" aria-hidden="true">·</span>{/if}
		{#if l === here}
			<span class="here" lang={l} aria-current="true">{l.toUpperCase()}</span>
		{:else}
			{@const href = counterpart(page.route.id, l)}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- counterpart() resolves the route -->
			<a
				{href}
				hreflang={l}
				lang={l}
				aria-label={NAMES[l]}
				title={NAMES[l]}
				onclick={(e) => {
					try {
						localStorage.setItem('babel:lang', l);
					} catch {
						// the browser's language decides next time, then
					}
					if (!onpick) return;
					e.preventDefault();
					onpick(href);
				}}>{l.toUpperCase()}</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	{/each}
</nav>

<style>
	.langs {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		font: 0.8rem var(--display-sc);
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		white-space: nowrap;
	}
	/* on the cover: in the corner, level with the music's horn, just to its left, on a patch of bare paper (with
	   soft edges) so the plan's lines don't run through the letters */
	.corner {
		position: fixed;
		right: calc(0.9rem + 3.1rem + env(safe-area-inset-right, 0px));
		bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px));
		z-index: 50;
		height: 2.6rem;
		align-items: center;
		gap: 0.45rem;
		padding: 0 0.7rem;
		font-size: 1rem;
		background: radial-gradient(closest-side, var(--paper) 62%, transparent);
	}
	.here {
		color: var(--ink);
	}
	.corner a {
		color: var(--sepia);
	}
	.dot {
		opacity: 0.7;
	}
	a {
		color: var(--ink-faint);
		text-decoration: none;
		transition: color 0.25s;
	}
	a:hover,
	a:focus-visible {
		color: var(--madder);
	}
</style>
