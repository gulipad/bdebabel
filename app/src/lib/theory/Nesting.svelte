<script lang="ts">
	/**
	 * Why the pages can't be stored: a universe in which every atom is a 1 PB disk, then every atom of it a
	 * universe of disks, and so on, zooming in one level at a time until the Library fits (at the 59th).
	 * Universe n holds 10^(80n + 15) bytes; the Library needs ≈ 10^4.683.
	 */
	import { steps } from '#lib/address.ts';
	import { seen } from '#lib/ui/seen.ts';

	const NEED = 4683,
		LAST = Math.ceil((NEED - 15) / 80); // 59
	const exp = (n: number) => 80 * n + 15;

	let on = $state(false),
		level = $state(1),
		zooming = $state(false);

	/** the atoms of a universe: dots scattered in a circle, one of them the one we zoom into */
	const atoms = (n: number) => {
		let s = n * 7919 + 13;
		const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
		return Array.from({ length: 70 }, () => {
			const a = r() * Math.PI * 2,
				d = Math.sqrt(r()) * 86;
			return { x: 100 + d * Math.cos(a), y: 100 + d * Math.sin(a), r: 1 + r() * 1.6 };
		});
	};
	const target = (n: number) => atoms(n)[n % 70];

	$effect(() => {
		if (!on) return;
		let t = 0;
		const step = () => {
			if (level >= LAST) {
				t = window.setTimeout(() => {
					level = 1;
					step();
				}, 4500);
				return;
			}
			// slow at first, then faster and faster, as the exponents run away
			const ms = Math.max(140, 900 * Math.pow(0.9, level));
			zooming = true;
			t = window.setTimeout(() => {
				zooming = false;
				level++;
				t = window.setTimeout(step, Math.max(60, ms * 0.35));
			}, ms);
		};
		t = window.setTimeout(step, 900);
		return () => clearTimeout(t);
	});

	const fits = $derived(exp(level) >= NEED);
	const zoom = $derived.by(() => {
		const a = target(level);
		return zooming ? `translate(${100 - a.x * 60}px, ${100 - a.y * 60}px) scale(60)` : 'none';
	});
</script>

<figure use:seen={(v) => (on = v)}>
	<div class="stage">
		<svg viewBox="0 0 200 200" role="img" aria-label="Universos dentro de universos">
			{#key level}
				<g class="universe" class:zooming style:transform={zoom}>
					<circle class="edge" cx="100" cy="100" r="92" />
					{#each atoms(level) as a, i (i)}
						<circle class="atom" class:target={a === target(level)} cx={a.x} cy={a.y} r={a.r} />
					{/each}
				</g>
			{/key}
		</svg>
		<div class="count" aria-live="polite">
			<p class="n">Universo nº <b>{level}</b></p>
			<p class="holds">
				caben 10<sup>{steps(exp(level))}</sup> bytes
			</p>
			<p class="need" class:fits>
				{fits ? 'Ya cabe la Biblioteca.' : 'La Biblioteca necesita 10'}{#if !fits}<sup>4.683</sup
					>{/if}
			</p>
		</div>
	</div>
	<figcaption>
		Una página son 3.200 × log₂ 29 ≈ 15.546 bits, unos 1.943 bytes, así que la Biblioteca ocupa 10<sup
			>4.680</sup
		>
		páginas × 1.943 bytes ≈ 10<sup>4.683</sup> bytes. Un universo de discos de 1 PB guarda 10<sup
			>80</sup
		>
		× 10<sup>15</sup> = 10<sup>95</sup>, y cada nivel más multiplica por otros 10<sup>80</sup>. Hace
		falta que 80·n + 15 ≥ 4.683, es decir, n = 59.
	</figcaption>
</figure>

<style>
	figure {
		margin: 2rem 0;
	}
	.stage {
		display: grid;
		grid-template-columns: minmax(0, 14rem) minmax(0, 1fr);
		gap: 1.6rem;
		align-items: center;
	}
	@media (max-width: 30rem) {
		.stage {
			grid-template-columns: 1fr;
			justify-items: center;
		}
	}
	svg {
		width: 100%;
		max-width: 14rem;
		overflow: hidden;
		border-radius: 50%;
	}
	.universe {
		transform-origin: 0 0;
		transition: transform 0.85s cubic-bezier(0.5, 0, 0.75, 0.2);
	}
	.edge {
		fill: rgba(92, 58, 34, 0.04);
		stroke: var(--sepia);
		stroke-width: 1.2;
		vector-effect: non-scaling-stroke;
	}
	.atom {
		fill: var(--sepia);
		opacity: 0.75;
	}
	.atom.target {
		fill: var(--madder);
		opacity: 1;
	}
	.count p {
		margin: 0;
	}
	.n {
		font: italic 1.25rem var(--display);
		color: var(--ink-dry);
	}
	.n b {
		font: 400 2.2rem var(--display);
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.holds {
		font: 0.9rem var(--mono);
		color: var(--ink-faint);
		margin-top: 0.2rem !important;
	}
	.need {
		font: italic 1.05rem var(--display);
		color: var(--ink-faint);
		margin-top: 0.6rem !important;
	}
	.need.fits {
		color: var(--madder);
	}
	sup {
		font-size: 0.7em;
	}
	figcaption {
		font: italic 1rem var(--display);
		color: var(--ink-faint);
		margin-top: 1rem;
		text-align: center;
	}
</style>
