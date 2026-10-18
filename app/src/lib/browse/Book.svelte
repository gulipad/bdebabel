<script lang="ts">
	/**
	 * A book taken from the shelf: open, with its 410 pages to leaf through before choosing one. The leaves turn
	 * as the page number moves (odd pages on the right, as in a printed book).
	 */
	import { PAGES } from '#lib/address.ts';
	import InkLink from '#lib/ui/InkLink.svelte';

	let {
		volume,
		page = $bindable(1),
		onopen
	}: { volume: number; page?: number; onopen: (page: number) => void } = $props();

	const clamp = (n: number) => Math.min(PAGES, Math.max(1, Math.round(n) || 1));
	const set = (n: number) => (page = clamp(n));
	/** how far through the book (0..1): the thickness of each side of the open book */
	const through = $derived((page - 1) / (PAGES - 1));
	/** the lines of text on a leaf, a little different for each spread */
	const lines = (seed: number) =>
		Array.from(
			{ length: 13 },
			(_, i) => 0.55 + 0.4 * Math.abs(Math.sin(seed * 12.9898 + i * 78.233))
		);
</script>

<div class="book">
	<svg viewBox="0 0 320 190" aria-hidden="true">
		<!-- the block of pages already read (left) and still to come (right) -->
		{#each Array.from({ length: 6 }, (_, i) => i) as i (i)}
			<path
				class="edge"
				d={`M ${158 - i * (1 + through * 2)} ${168 + i * 1.6} L ${18 - i * (1 + through * 2)} ${158 + i * 1.6}`}
			/>
			<path
				class="edge"
				d={`M ${162 + i * (1 + (1 - through) * 2)} ${168 + i * 1.6} L ${302 + i * (1 + (1 - through) * 2)} ${158 + i * 1.6}`}
			/>
		{/each}
		<path class="leaf" d="M160 22 Q 92 8 18 18 L 18 158 Q 92 150 160 168 Z" />
		<path class="leaf" d="M160 22 Q 228 8 302 18 L 302 158 Q 228 150 160 168 Z" />
		{#each lines(Math.floor(page / 2)) as l, i (i)}
			<line class="text" x1="36" x2={36 + 104 * l} y1={40 + i * 8.6} y2={40 + i * 8.6 - 0.6} />
			<line
				class="text"
				x1="178"
				x2={178 + 104 * lines(Math.floor(page / 2) + 7)[i]}
				y1={40 + i * 8.6 - 0.6}
				y2={40 + i * 8.6}
			/>
		{/each}
		<text class="folio" x="92" y="150">{page % 2 ? (page > 1 ? page - 1 : '') : page}</text>
		<text class="folio" x="230" y="150">{page % 2 ? page : Math.min(PAGES, page + 1)}</text>
	</svg>

	<p class="which">Volumen {volume} · página <b>{page}</b> de {PAGES}</p>

	<div class="leaf-through">
		<button type="button" class="turn" aria-label="Página anterior" onclick={() => set(page - 1)}
			>‹</button
		>
		<input
			type="range"
			min="1"
			max={PAGES}
			value={page}
			oninput={(e) => set(Number(e.currentTarget.value))}
			aria-label="Página"
		/>
		<button type="button" class="turn" aria-label="Página siguiente" onclick={() => set(page + 1)}
			>›</button
		>
		<input
			class="number"
			type="number"
			min="1"
			max={PAGES}
			value={page}
			onchange={(e) => set(Number(e.currentTarget.value))}
			aria-label="Número de página"
		/>
	</div>

	<div class="actions">
		<InkLink onclick={() => onopen(page)}>Leer la página {page}</InkLink>
		<InkLink small onclick={() => onopen(clamp(1 + Math.random() * PAGES))}
			>Una al azar de este libro</InkLink
		>
	</div>
</div>

<style>
	.book {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}
	svg {
		width: 100%;
		max-width: 26rem;
		overflow: visible;
	}
	.leaf {
		fill: rgba(250, 243, 226, 0.75);
		stroke: var(--sepia);
		stroke-width: 1.2;
	}
	.edge {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 0.6;
		opacity: 0.6;
	}
	.text {
		stroke: var(--ink-faint);
		stroke-width: 1.2;
		stroke-linecap: round;
		opacity: 0.55;
	}
	.folio {
		font: italic 9px var(--display);
		fill: var(--ink-faint);
		text-anchor: middle;
	}
	.which {
		margin: 0;
		font: italic 1.05rem var(--display);
		color: var(--ink-dry);
	}
	.which b {
		font: 1.5rem var(--display);
		color: var(--ink);
		font-weight: 400;
	}
	.leaf-through {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		max-width: 26rem;
	}
	.turn {
		border: 0;
		background: none;
		padding: 0 0.3rem;
		font: 1.6rem var(--display);
		color: var(--ink);
		line-height: 1;
	}
	.turn:hover {
		background: none;
		color: var(--madder);
	}
	/* the slider: a ruled line, and a nib to drag along it */
	input[type='range'] {
		flex: 1;
		min-width: 0;
		appearance: none;
		background: none;
		height: 1.4rem;
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 1.5px;
		background: var(--sepia);
	}
	input[type='range']::-moz-range-track {
		height: 1.5px;
		background: var(--sepia);
	}
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 0.7rem;
		height: 1.1rem;
		margin-top: -0.53rem;
		background: var(--ink);
		clip-path: polygon(50% 100%, 0 30%, 25% 0, 75% 0, 100% 30%);
	}
	input[type='range']::-moz-range-thumb {
		width: 0.7rem;
		height: 1.1rem;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		clip-path: polygon(50% 100%, 0 30%, 25% 0, 75% 0, 100% 30%);
	}
	.number {
		width: 4.2rem;
		font: 1rem var(--mono);
		color: var(--ink);
		background: none;
		border: 0;
		border-bottom: 1px solid var(--sepia);
		padding: 0.15rem 0.2rem;
		text-align: center;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.4rem;
		justify-content: center;
		align-items: baseline;
	}
</style>
