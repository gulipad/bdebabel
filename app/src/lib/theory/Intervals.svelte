<script lang="ts">
	/**
	 * How an address picks a page: the line of numbers is cut by the probabilities of the first word; the
	 * slice the address falls in is the word, and it is cut again by the probabilities of the next one; and so
	 * on. Each choice costs −log₂ p bits. Probabilities here are made up to show the idea, not the model's.
	 */
	import { seen } from '#lib/ui/seen.ts';
	import InkLink from '#lib/ui/InkLink.svelte';
	import Log from './Log.svelte';

	const LEVELS: { seg: [string, number][]; pick: number }[] = [
		{
			seg: [
				['—', 0.18],
				['El', 0.12],
				['La', 0.1],
				['No', 0.08],
				['Y', 0.06],
				['Pero', 0.04],
				['…', 0.42]
			],
			pick: 3
		},
		{
			seg: [
				[',', 0.3],
				['lo', 0.16],
				['es', 0.07],
				['me', 0.06],
				['sé', 0.05],
				['…', 0.36]
			],
			pick: 1
		},
		{
			seg: [
				['sé', 0.38],
				['creo', 0.12],
				['sabía', 0.09],
				['haré', 0.05],
				['…', 0.36]
			],
			pick: 0
		},
		{
			seg: [
				['.', 0.44],
				[',', 0.26],
				['…', 0.3]
			],
			pick: 0
		}
	];
	const W = 600;

	let on = $state(false),
		level = $state(0),
		phase = $state<'show' | 'pick' | 'zoom' | 'done'>('show');

	const spans = (l: number) => {
		let x = 0;
		return LEVELS[l].seg.map(([word, p]) => {
			const s = { word, p, x, w: p * W };
			x += p * W;
			return s;
		});
	};
	const chosen = $derived(spans(level)[LEVELS[level].pick]);
	const words = $derived(
		LEVELS.slice(0, level + (phase === 'show' ? 0 : 1)).map((l) => l.seg[l.pick]![0])
	);
	const bits = $derived(
		LEVELS.slice(0, level + (phase === 'show' ? 0 : 1)).reduce(
			(b, l) => b - Math.log2(l.seg[l.pick]![1]),
			0
		)
	);
	/** the same sentence in Basile's library: every character log₂ 29 bits */
	const basile = $derived(
		LEVELS.map((l) => l.seg[l.pick]![0])
			.join(' ')
			.replace(' .', '.').length * Math.log2(29)
	);
	const sentence = $derived(words.join(' ').replace(' .', '.').replace(' ,', ','));

	/** it can be paused where it is, and started again from the first word */
	let paused = $state(false),
		runs = $state(0);
	function restart() {
		level = 0;
		phase = 'show';
		paused = false;
		runs++;
	}

	$effect(() => {
		if (!on || paused) return;
		void runs;
		let t = 0;
		const later = (ms: number, f: () => void) => (t = window.setTimeout(f, ms));
		const run = () => {
			phase = 'show';
			later(1300, () => {
				phase = 'pick';
				later(1300, () => {
					if (level === LEVELS.length - 1) {
						phase = 'done';
						later(4200, () => {
							level = 0;
							run();
						});
					} else {
						phase = 'zoom';
						later(950, () => {
							level++;
							run();
						});
					}
				});
			});
		};
		run();
		return () => clearTimeout(t);
	});
</script>

<figure use:seen={(v) => (on = v)}>
	<p class="sentence" aria-live="polite">
		{#if sentence}«{sentence}»{:else}&nbsp;{/if}
		<span class="bits"
			>{bits
				? `${bits.toLocaleString('es-ES', { maximumFractionDigits: 1 })} bits`
				: ''}{#if phase === 'done'}<span class="basile"
					>en la de Basile, {basile.toLocaleString('es-ES', { maximumFractionDigits: 1 })} bits</span
				>{/if}</span
		>
	</p>
	<svg
		viewBox={`0 -14 ${W} 92`}
		role="img"
		aria-label="La línea de los números, cortada por las probabilidades de cada palabra"
	>
		{#key level}
			<g
				class="level"
				class:zoom={phase === 'zoom'}
				style:transform={phase === 'zoom'
					? `translateX(${-chosen.x * (W / chosen.w)}px) scaleX(${W / chosen.w})`
					: 'none'}
			>
				{#each spans(level) as s, i (i)}
					<rect
						class="seg"
						class:other={s.word === '…'}
						class:chosen={phase !== 'show' && i === LEVELS[level].pick}
						x={s.x}
						y="10"
						width={s.w}
						height="40"
					/>
					{#if s.w > 26}
						<text class="word" x={s.x + s.w / 2} y="35"
							>{s.word === '…' ? '(todas las demás)' : s.word}</text
						>
						<text class="p" x={s.x + s.w / 2} y="66">{Math.round(s.p * 100)}%</text>
					{/if}
				{/each}
			</g>
		{/key}
		<!-- the address: a point on the line, always inside the slice chosen -->
		<g class="pin" style:transform={`translateX(${chosen.x + chosen.w * 0.55}px)`}>
			<path d="M0 8 L -5 -4 L 5 -4 Z" />
			<line x1="0" x2="0" y1="8" y2="50" />
		</g>
	</svg>
	<div class="controls">
		<InkLink small onclick={() => (paused = !paused)}>{paused ? '▸ Seguir' : '❚❚ Parar'}</InkLink>
		<InkLink small onclick={restart}>↺ Reiniciar</InkLink>
	</div>
	<figcaption>
		La dirección es un punto de esa línea, y cada palabra es la rodaja en la que cae. Cada palabra
		cuesta
		<Log /> bits, poco si es probable y mucho si es rara. Las probabilidades del dibujo son inventadas.
	</figcaption>
</figure>

<style>
	figure {
		margin: 2.2rem 0;
	}
	.sentence {
		margin: 0 0 0.6rem;
		font: italic 1.5rem var(--display);
		color: var(--ink);
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 1rem;
		min-height: 2rem;
	}
	.basile {
		display: block;
		color: var(--ink-faint);
		font-size: 0.78rem;
		text-align: right;
	}
	.bits {
		font: 0.85rem var(--mono);
		color: var(--madder);
		font-style: normal;
	}
	svg {
		width: 100%;
		overflow: hidden;
	}
	.level {
		transform-origin: 0 0;
		transition: transform 0.9s cubic-bezier(0.6, 0, 0.3, 1);
	}
	.seg {
		fill: rgba(251, 247, 238, 0.6);
		stroke: var(--sepia);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
		transition: fill 0.4s;
	}
	.seg.other {
		fill: rgba(92, 58, 34, 0.07);
	}
	.seg.chosen {
		fill: rgba(164, 71, 59, 0.22);
	}
	.word {
		font: italic 15px var(--display);
		fill: var(--ink);
		text-anchor: middle;
		transition: opacity 0.3s;
	}
	.p {
		font: 10px var(--mono);
		fill: var(--ink-faint);
		text-anchor: middle;
		transition: opacity 0.3s;
	}
	.zoom .word,
	.zoom .p {
		opacity: 0;
	}
	.pin {
		transition: transform 0.9s cubic-bezier(0.6, 0, 0.3, 1);
	}
	.pin path {
		fill: var(--madder);
	}
	.pin line {
		stroke: var(--madder);
		stroke-width: 1.2;
	}
	.controls {
		display: flex;
		justify-content: center;
		gap: 1.2rem;
		margin-top: 0.4rem;
	}
	figcaption {
		font: italic 1.02rem var(--display);
		color: var(--ink-faint);
		margin-top: 0.6rem;
		text-align: center;
	}
</style>
