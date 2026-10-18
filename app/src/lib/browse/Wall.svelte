<script lang="ts">
	/**
	 * One wall of a room, face on: five shelves of thirty-two books each, their spines drawn in the plan's ink,
	 * each a little different (height, width, a lean, the bands on the spine), always the same for the same
	 * wall of the same room. A book is chosen by clicking it.
	 */
	import { SHELVES, VOLUMES } from '#lib/address.ts';

	let {
		seed,
		current,
		onpick
	}: {
		/** what makes this wall's books look as they do: the room and the wall */
		seed: string;
		current?: { shelf: number; volume: number };
		onpick: (shelf: number, volume: number) => void;
	} = $props();

	const W = 660,
		SHELF_H = 84,
		TOP = 14,
		LEFT = 18,
		RIGHT = W - 18;

	/** small deterministic randomness from the seed */
	function rng(s: string) {
		let h = 2166136261;
		for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
		return () => {
			h = Math.imul(h ^ (h >>> 15), 2246822507);
			h = Math.imul(h ^ (h >>> 13), 3266489909);
			return ((h ^= h >>> 16) >>> 0) / 4294967296;
		};
	}

	const books = $derived.by(() => {
		const r = rng(seed);
		return Array.from({ length: SHELVES }, (_, s) => {
			const floor = TOP + (s + 1) * SHELF_H;
			const widths = Array.from({ length: VOLUMES }, () => 0.75 + r() * 0.5);
			const scale = (RIGHT - LEFT - VOLUMES * 1.2) / widths.reduce((a, b) => a + b, 0);
			let x = LEFT;
			return widths.map((wd, v) => {
				const w = wd * scale,
					h = 46 + r() * 22,
					lean = r() < 0.06 ? (r() - 0.5) * 7 : 0,
					bands = Math.floor(r() * 3);
				const b = { shelf: s + 1, volume: v + 1, x, w, h, floor, lean, bands };
				x += w + 1.2;
				return b;
			});
		});
	});
</script>

<svg
	viewBox={`0 0 ${W} ${TOP + SHELVES * SHELF_H + 16}`}
	role="group"
	aria-label="El muro y sus libros"
>
	{#each books as shelf, s (s)}
		{@const floor = TOP + (s + 1) * SHELF_H}
		<g class="shelf">
			<text class="no" x="4" y={floor - 34}>{s + 1}</text>
			{#each shelf as b (b.volume)}
				<g
					class="book"
					class:current={current?.shelf === b.shelf && current?.volume === b.volume}
					role="button"
					tabindex="0"
					aria-label={`Balda ${b.shelf}, volumen ${b.volume}`}
					transform={`rotate(${b.lean} ${b.x + b.w / 2} ${floor})`}
					onclick={() => onpick(b.shelf, b.volume)}
					onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick(b.shelf, b.volume)}
				>
					<title>Balda {b.shelf} · volumen {b.volume}</title>
					<rect class="spine" x={b.x} y={floor - b.h} width={b.w} height={b.h} rx="1.2" />
					{#each Array.from({ length: b.bands }, (_, i) => i) as i (i)}
						<line
							class="band"
							x1={b.x + 2}
							x2={b.x + b.w - 2}
							y1={floor - b.h + 7 + i * 4}
							y2={floor - b.h + 7 + i * 4}
						/>
					{/each}
					<line class="band" x1={b.x + 2} x2={b.x + b.w - 2} y1={floor - 8} y2={floor - 8} />
				</g>
			{/each}
			<line class="plank" x1={LEFT - 10} x2={RIGHT + 10} y1={floor + 1.5} y2={floor + 1.5} />
		</g>
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	.plank {
		stroke: var(--sepia);
		stroke-width: 2.2;
		stroke-linecap: round;
	}
	.no {
		font: italic 12px var(--display);
		fill: var(--ink-faint);
	}
	.book {
		cursor: pointer;
		outline: none;
	}
	.spine {
		fill: rgba(239, 224, 191, 0.55);
		stroke: var(--sepia);
		stroke-width: 1;
		transition:
			fill 0.25s,
			transform 0.25s;
	}
	.band {
		stroke: var(--sepia);
		stroke-width: 0.7;
		opacity: 0.8;
	}
	.book:hover .spine,
	.book:focus-visible .spine {
		fill: rgba(164, 71, 59, 0.16);
		stroke: var(--ink);
		transform: translateY(-5px);
	}
	.book:hover .band,
	.book:focus-visible .band {
		transform: translateY(-5px);
	}
	.band {
		transition: transform 0.25s;
	}
	.book.current .spine {
		fill: rgba(164, 71, 59, 0.3);
		stroke: var(--madder);
	}
</style>
