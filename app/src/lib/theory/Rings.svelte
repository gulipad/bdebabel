<script lang="ts">
	/**
	 * The Library's geography: distance from the centre is the length of a page's address, in bits (pasos).
	 * The rings are babel-1's (lab/universes/babel-1/rings.json), and the pages on them were measured there.
	 */
	import { steps } from '#lib/address.ts';
	import { seen } from '#lib/ui/seen.ts';

	const RINGS = [
		{ name: 'El Centro', until: 2078 },
		{ name: 'Los Barrios', until: 2820 },
		{ name: 'Las Afueras', until: 5640 },
		{ name: 'Los Confines', until: 22560 }
	];
	const RADII = [0, 52, 104, 150, 196, 236];
	const STOPS = [0, ...RINGS.map((r) => r.until), 40000];
	/** distance in bits → radius, piecewise through the ring boundaries */
	const radius = (bits: number) => {
		for (let i = 1; i < STOPS.length; i++)
			if (bits <= STOPS[i])
				return (
					RADII[i - 1] +
					((bits - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1])) * (RADII[i] - RADII[i - 1])
				);
		return RADII.at(-1)!;
	};
	const PAGES = [
		{ name: '«Es una historia muy larga»', bits: 0, a: 90 },
		{ name: '«te quiero», buscada', bits: 2126, a: 215 },
		{ name: 'una página al azar', bits: 2322, a: 335 },
		{ name: 'ruido puro', bits: 19500, a: 140 }
	];
	let on = $state(false);
</script>

<figure use:seen={(v) => (on = v)} class:on>
	<svg viewBox="-260 -260 520 520" role="img" aria-label="Los anillos de la Biblioteca">
		<circle class="ring void" r={RADII.at(-1)} pathLength="1" style:--d="0s" />
		{#each RINGS as r, i (r.name)}
			<circle class="ring" r={RADII[i + 1]} pathLength="1" style:--d="{0.2 + i * 0.3}s" />
			<text class="name" y={-(RADII[i] + RADII[i + 1]) / 2 + 4} style:--d="{0.6 + i * 0.3}s"
				>{r.name}</text
			>
			<text class="until" y={RADII[i + 1] - 6} style:--d="{0.6 + i * 0.3}s">
				{steps(r.until)}
			</text>
		{/each}
		<text class="name" y={-(RADII[4] + RADII[5]) / 2 + 4} style:--d="1.8s">El Vacío</text>
		{#each PAGES as p, i (p.name)}
			{@const r = radius(p.bits)}
			{@const x = r * Math.cos((p.a * Math.PI) / 180)}
			{@const y = r * Math.sin((p.a * Math.PI) / 180)}
			<g class="page" style:--d="{2 + i * 0.35}s">
				<circle class="dot" cx={x} cy={y} r="4.5" />
				<text
					class="label"
					x={x + (x < -20 ? -9 : 9)}
					y={y + (p.bits === 0 ? 18 : 4)}
					text-anchor={p.bits === 0 ? 'middle' : x < -20 ? 'end' : 'start'}
				>
					{p.name} · {steps(p.bits)}
				</text>
			</g>
		{/each}
	</svg>
	<figcaption>
		La distancia al centro, en pasos, es la longitud de la dirección de la página. El Centro es la
		página que el bibliotecario espera más que ninguna; lo legible vive en Los Barrios; el ruido, al
		fondo.
	</figcaption>
</figure>

<style>
	figure {
		margin: 2rem 0;
	}
	svg {
		display: block;
		width: 100%;
		max-width: 30rem;
		margin: 0 auto;
		overflow: visible;
	}
	.ring {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 1.3;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
	}
	.void {
		stroke-dasharray: 0.006 0.012;
		stroke-dashoffset: 0;
		opacity: 0;
	}
	.on .ring:not(.void) {
		animation: draw 1.2s cubic-bezier(0.4, 0.1, 0.3, 1) forwards;
		animation-delay: var(--d);
	}
	.on .void {
		animation: appear 1s ease forwards;
	}
	text {
		opacity: 0;
		text-anchor: middle;
	}
	.on text,
	.on .page {
		animation: appear 0.8s ease forwards;
		animation-delay: var(--d);
	}
	.page {
		opacity: 0;
	}
	.page text {
		opacity: 1;
		animation: none !important;
	}
	.name {
		font: italic 13px var(--display);
		fill: var(--ink-dry);
	}
	.until {
		font: 9px var(--mono);
		fill: var(--ink-faint);
	}
	.dot {
		fill: var(--madder);
	}
	.label {
		font: italic 12px var(--display);
		fill: var(--ink);
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	@keyframes appear {
		to {
			opacity: 1;
		}
	}
	figcaption {
		text-align: center;
		font: italic 1.02rem var(--display);
		color: var(--ink-faint);
		margin-top: 0.4rem;
	}
</style>
