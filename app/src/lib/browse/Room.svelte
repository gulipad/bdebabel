<script lang="ts">
	/**
	 * A room of the Library, from above, drawn as the cover's galleries are: a hexagon of double walls. Four
	 * walls carry the shelves, five to a wall; the two free sides open onto hallways that lead to other rooms;
	 * in the middle, the ventilation shaft. A wall is chosen by clicking it.
	 */
	let {
		current = 0,
		onpick,
		onhall
	}: {
		current?: number;
		onpick: (wall: number) => void;
		/** walking out through a hallway, to another room */
		onhall?: () => void;
	} = $props();

	const C = 200,
		R = 150,
		GAP = 9;
	const corner = (k: number, r: number) => {
		const a = (Math.PI / 3) * k;
		return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
	};
	/** sides by the corner they start at; walls 1–4 go round from the upper left, the free sides are top and bottom */
	const WALL_SIDES = [3, 5, 0, 2];
	const FREE_SIDES = [4, 1];

	const side = (k: number, r: number) => {
		const [ax, ay] = corner(k, r),
			[bx, by] = corner(k + 1, r);
		return { ax, ay, bx, by };
	};
	/** the shelves' edges along a wall: short ticks toward the middle */
	const ticks = (k: number) => {
		const s = side(k, R - GAP - 7);
		return Array.from({ length: 9 }, (_, i) => {
			const t = 0.14 + (i / 8) * 0.72,
				x = s.ax + (s.bx - s.ax) * t,
				y = s.ay + (s.by - s.ay) * t;
			return { x, y, x2: x + (C - x) * 0.07, y2: y + (C - y) * 0.07 };
		});
	};
	/** where a wall's name goes, and its angle (kept upright) */
	const label = (k: number) => {
		const s = side(k, R - GAP - 26);
		let a = (Math.atan2(s.by - s.ay, s.bx - s.ax) * 180) / Math.PI;
		if (a > 90) a -= 180;
		if (a < -90) a += 180;
		return { x: (s.ax + s.bx) / 2, y: (s.ay + s.by) / 2, a };
	};
	/** a free side: the wall broken by a doorway, its jambs turning outward into a hallway */
	const door = (k: number) => {
		const o = side(k, R),
			i = side(k, R - GAP),
			at = (s: ReturnType<typeof side>, t: number) => [
				s.ax + (s.bx - s.ax) * t,
				s.ay + (s.by - s.ay) * t
			];
		const out = [corner(k, R), corner(k + 1, R)].map(([x, y]) => [x - C, y - C]);
		const n = [(out[0][0] + out[1][0]) / 2, (out[0][1] + out[1][1]) / 2],
			len = Math.hypot(n[0], n[1]),
			u = [n[0] / len, n[1] / len];
		const [a1, a2] = [at(o, 0.32), at(o, 0.68)];
		return {
			segs: [
				[at(o, 0), a1],
				[a2, at(o, 1)],
				[at(i, 0), at(i, 0.32)],
				[at(i, 0.68), at(i, 1)]
			],
			jambs: [
				[a1, [a1[0] + u[0] * 34, a1[1] + u[1] * 34]],
				[a2, [a2[0] + u[0] * 34, a2[1] + u[1] * 34]]
			],
			name: { x: (a1[0] + a2[0]) / 2 + u[0] * 50, y: (a1[1] + a2[1]) / 2 + u[1] * 50 + 4 }
		};
	};
</script>

<svg viewBox="-20 -30 440 460" role="group" aria-label="La sala, vista desde arriba">
	{#each FREE_SIDES as k (k)}
		{@const d = door(k)}
		{#each [...d.segs, ...d.jambs] as [[x1, y1], [x2, y2]], i (i)}
			<line class="ink draw" {x1} {y1} {x2} {y2} pathLength="1" />
		{/each}
		<g
			class="hall"
			role="button"
			tabindex="0"
			aria-label="Salir por el zaguán a otra sala"
			onclick={() => onhall?.()}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onhall?.()}
		>
			<title>Salir por el zaguán a otra sala</title>
			<rect class="hit" x={d.name.x - 40} y={d.name.y - 34} width="80" height="48" />
			<text class="note" x={d.name.x} y={d.name.y}>zaguán</text>
		</g>
	{/each}

	{#each WALL_SIDES as k, w (k)}
		{@const o = side(k, R)}
		{@const i = side(k, R - GAP)}
		{@const l = label(k)}
		<g
			class="wall"
			class:current={current === w + 1}
			role="button"
			tabindex="0"
			aria-label={`Muro ${w + 1}`}
			onclick={() => onpick(w + 1)}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick(w + 1)}
		>
			<!-- a generous band to aim at -->
			<polygon class="hit" points={`${o.ax},${o.ay} ${o.bx},${o.by} ${C},${C}`} />
			<line class="ink draw" x1={o.ax} y1={o.ay} x2={o.bx} y2={o.by} pathLength="1" />
			<line class="ink draw" x1={i.ax} y1={i.ay} x2={i.bx} y2={i.by} pathLength="1" />
			{#each ticks(k) as t, j (j)}
				<line class="ink fine draw" x1={t.x} y1={t.y} x2={t.x2} y2={t.y2} pathLength="1" />
			{/each}
			<text class="name" transform={`translate(${l.x} ${l.y}) rotate(${l.a})`}>muro {w + 1}</text>
		</g>
	{/each}

	<circle class="ink draw" cx={C} cy={C} r="22" pathLength="1" />
	<circle class="ink fine draw" cx={C} cy={C} r="27" pathLength="1" />
	<text class="note" x={C} y={C + 46}>pozo de ventilación</text>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		max-width: 26rem;
		margin: 0 auto;
		overflow: visible;
	}
	.ink {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 1.7;
		stroke-linecap: round;
	}
	.fine {
		stroke-width: 0.9;
		opacity: 0.75;
	}
	/* drawn as with a pen */
	.draw {
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 1.4s cubic-bezier(0.4, 0.1, 0.3, 1) forwards;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	.hit {
		fill: transparent;
		stroke: none;
	}
	.wall,
	.hall {
		cursor: pointer;
		outline: none;
	}
	.hall:hover .note,
	.hall:focus-visible .note {
		fill: var(--madder);
	}
	.wall .ink {
		transition:
			stroke 0.3s,
			stroke-width 0.3s;
	}
	.wall:hover .ink,
	.wall:focus-visible .ink,
	.wall.current .ink {
		stroke: var(--ink);
		stroke-width: 2.4;
	}
	.wall:hover .fine,
	.wall:focus-visible .fine,
	.wall.current .fine {
		stroke-width: 1.3;
		opacity: 1;
	}
	.name,
	.note {
		font: italic 13px var(--display);
		fill: var(--ink-dry);
		text-anchor: middle;
		dominant-baseline: middle;
	}
	.note {
		font-size: 11.5px;
		fill: var(--ink-faint);
	}
	.wall:hover .name,
	.wall:focus-visible .name,
	.wall.current .name {
		fill: var(--madder);
	}
	@media (prefers-reduced-motion: reduce) {
		.draw {
			animation: none;
			stroke-dashoffset: 0;
		}
	}
</style>
