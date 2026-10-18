<script lang="ts">
	/**
	 * A way to somewhere, as on the cover: in the title's face; on hover it grows a little and a pen stroke is
	 * drawn under it from the left. A link with `href`, a button without. `current` keeps the stroke drawn.
	 */
	import type { Snippet } from 'svelte';

	let {
		href,
		onclick,
		current = false,
		small = false,
		children
	}: {
		href?: string;
		onclick?: (e: MouseEvent) => void;
		current?: boolean;
		small?: boolean;
		children: Snippet;
	} = $props();
</script>

{#snippet stroke()}
	<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
		<path d="M3 6.2 C 22 4.6, 41 7.4, 60 5.6 S 88 4.4, 97 5.4" />
	</svg>
{/snippet}

{#if href}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolved paths -->
	<a
		class="way"
		class:current
		class:small
		{href}
		{onclick}
		aria-current={current ? 'page' : undefined}
		><span>{@render children()}</span>{@render stroke()}</a
	>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button type="button" class="way" class:current class:small {onclick}
		><span>{@render children()}</span>{@render stroke()}</button
	>
{/if}

<style>
	.way {
		position: relative;
		display: inline-block;
		padding: 0.15em 0.35em;
		border: 0;
		background: none;
		color: var(--ink);
		font: 1.02rem var(--display-sc);
		letter-spacing: 0.16em;
		text-decoration: none;
		cursor: pointer;
		transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.3, 1);
	}
	.way.small {
		font-size: 0.86rem;
		letter-spacing: 0.12em;
	}
	.way:hover,
	.way:focus-visible {
		transform: scale(1.07);
		background: none;
	}
	.way:focus-visible {
		outline: none;
	}
	svg {
		position: absolute;
		left: 8%;
		bottom: -0.1em;
		width: 84%;
		height: 0.4em;
		overflow: visible;
		clip-path: inset(-50% 100% -50% 0);
		transition: clip-path 0.45s cubic-bezier(0.3, 0.6, 0.2, 1);
	}
	.way:hover svg,
	.way:focus-visible svg,
	.way.current svg {
		clip-path: inset(-50% 0 -50% 0);
	}
	path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3px;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	@media (prefers-reduced-motion: reduce) and (hover: hover) {
		.way,
		svg {
			transition: none;
		}
	}
</style>
