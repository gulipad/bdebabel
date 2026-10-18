<script lang="ts">
	/** The Library's measures, drawn in turn as they come into view: room, wall, shelf, book, page. */
	import { seen } from '#lib/ui/seen.ts';

	let on = $state(false);
	const hex = (cx: number, cy: number, r: number) =>
		Array.from({ length: 6 }, (_, k) => {
			const a = (Math.PI / 3) * k;
			return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
		}).join(' ');
</script>

<figure use:seen={(v) => (on = v)} class:on>
	<svg
		viewBox="0 0 640 170"
		role="img"
		aria-label="Una sala, un muro, una balda, un libro, una página"
	>
		<!-- la sala -->
		<g class="step" style:--d="0s">
			<polygon class="ink" points={hex(64, 70, 46)} pathLength="1" />
			<polygon class="ink fine" points={hex(64, 70, 40)} pathLength="1" />
			<circle class="ink fine" cx="64" cy="70" r="7" pathLength="1" />
			<text x="64" y="140">1 sala</text>
		</g>
		<text class="times" x="128" y="75">×</text>
		<!-- el muro: cinco baldas -->
		<g class="step" style:--d="0.5s">
			<rect class="ink" x="150" y="26" width="76" height="88" pathLength="1" />
			{#each [43, 60, 77, 94] as y (y)}<line
					class="ink fine"
					x1="150"
					x2="226"
					y1={y}
					y2={y}
					pathLength="1"
				/>{/each}
			<text x="188" y="140">4 muros</text>
		</g>
		<text class="times" x="250" y="75">×</text>
		<!-- la balda: 32 libros -->
		<g class="step" style:--d="1s">
			{#each Array.from({ length: 16 }, (_, i) => i) as i (i)}
				<rect
					class="ink fine"
					x={272 + i * 5.2}
					y={58 - (i % 3) * 4}
					width="4.4"
					height={30 + (i % 3) * 4}
					pathLength="1"
				/>
			{/each}
			<line class="ink" x1="268" x2="358" y1="88.5" y2="88.5" pathLength="1" />
			<text x="314" y="140">5 baldas</text>
		</g>
		<text class="times" x="380" y="75">×</text>
		<!-- el libro -->
		<g class="step" style:--d="1.5s">
			<path class="ink" d="M402 34 h44 v76 h-44 z M408 34 v76" pathLength="1" />
			<text x="424" y="140">32 libros</text>
		</g>
		<text class="times" x="470" y="75">×</text>
		<!-- la página -->
		<g class="step" style:--d="2s">
			<path class="ink" d="M500 26 h44 l12 12 v76 h-56 z" pathLength="1" />
			{#each [46, 56, 66, 76, 86, 96] as y (y)}<line
					class="ink fine"
					x1="508"
					x2={y === 96 ? 532 : 548}
					y1={y}
					y2={y}
					pathLength="1"
				/>{/each}
			<text x="528" y="140">410 páginas</text>
		</g>
	</svg>
	<figcaption>
		<span class="sum">4 × 5 × 32 × 410 = <b>262.400 páginas</b> por sala</span>, de 3.200 caracteres
		cada una.
	</figcaption>
</figure>

<style>
	figure {
		margin: 2rem 0;
	}
	svg {
		width: 100%;
		overflow: visible;
	}
	.ink {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
	}
	.fine {
		stroke-width: 0.9;
	}
	text {
		font: italic 15px var(--display);
		fill: var(--ink-dry);
		text-anchor: middle;
		opacity: 0;
	}
	.times {
		font: 20px var(--display);
		fill: var(--ink-faint);
	}
	.on .ink {
		animation: draw 1.1s cubic-bezier(0.4, 0.1, 0.3, 1) forwards;
		animation-delay: var(--d);
	}
	.on .step text {
		animation: appear 0.8s ease forwards;
		animation-delay: calc(var(--d) + 0.6s);
	}
	.on .times {
		animation: appear 0.6s ease forwards 2.4s;
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
	.sum b {
		font-style: normal;
		font-weight: 400;
		color: var(--ink);
	}
</style>
