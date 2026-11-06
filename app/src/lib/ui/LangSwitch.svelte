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

<!-- each language's flag, drawn small (emoji flags don't show on Windows), muted toward the paper by the style -->
{#snippet flag(l: string)}
	<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">
		{#if l === 'es'}
			<rect width="30" height="20" fill="#aa151b" />
			<rect y="5" width="30" height="10" fill="#f1bf00" />
		{:else}
			<clipPath id="uk-cross"><path d="M15 10h15v10zv10H0zH0V0zV0h15z" /></clipPath>
			<rect width="30" height="20" fill="#012169" />
			<path d="M0 0l30 20m0-20L0 20" stroke="#fff" stroke-width="4" />
			<path d="M0 0l30 20m0-20L0 20" stroke="#c8102e" stroke-width="2" clip-path="url(#uk-cross)" />
			<path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6" />
			<path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4" />
		{/if}
	</svg>
{/snippet}

<!-- the pen stroke under the language you're in, as under the current way in the inner pages (InkLink) -->
{#snippet stroke()}
	<svg class="stroke" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
		<path d="M3 6.2 C 22 4.6, 41 7.4, 60 5.6 S 88 4.4, 97 5.4" />
	</svg>
{/snippet}

<nav class="langs" class:corner aria-label={LABEL[here]}>
	{#each LANGS as l, i (l)}
		{#if i}<span class="dot" aria-hidden="true">·</span>{/if}
		{#if l === here}
			<span class="lang here" lang={l} aria-current="true"
				>{@render flag(l)}<span class="code">{l.toUpperCase()}</span>{@render stroke()}</span
			>
		{:else}
			{@const href = counterpart(page.route.id, l)}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- counterpart() resolves the route -->
			<a
				class="lang"
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
				}}>{@render flag(l)}<span class="code">{l.toUpperCase()}</span></a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	{/each}
</nav>

<style>
	.langs {
		display: inline-flex;
		align-items: center;
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
		gap: 0.55rem;
		padding: 0 0.8rem;
		font-size: 1rem;
		background: radial-gradient(closest-side, var(--paper) 70%, transparent);
	}
	/* a language: its flag and its two letters */
	.lang {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.35em;
		padding: 0.15em 0.1em;
		color: var(--ink-faint);
		text-decoration: none;
		transition: color 0.25s;
	}
	.flag {
		width: 1.3em;
		height: auto;
		border-radius: 1.5px;
		box-shadow: 0 0 0 0.5px rgba(40, 28, 20, 0.35);
		/* printed on the paper: a little of its warmth, a little less colour */
		filter: sepia(0.25) saturate(0.85);
		transition:
			filter 0.25s,
			opacity 0.25s;
	}
	/* the language you're in: full ink, its flag in colour, and the pen's stroke under it */
	.here {
		color: var(--ink);
	}
	.stroke {
		position: absolute;
		left: 0;
		right: 0;
		bottom: -0.2em;
		width: 100%;
		height: 0.4em;
		overflow: visible;
	}
	.stroke path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3px;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	/* the other: faded, until a hand comes near */
	a.lang .flag {
		filter: grayscale(0.85) sepia(0.2);
		opacity: 0.55;
	}
	a.lang:hover,
	a.lang:focus-visible {
		color: var(--madder);
	}
	a.lang:hover .flag,
	a.lang:focus-visible .flag {
		filter: sepia(0.25) saturate(0.85);
		opacity: 1;
	}
	.dot {
		opacity: 0.7;
	}
</style>
