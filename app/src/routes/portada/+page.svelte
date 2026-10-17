<script lang="ts">
	/**
	 * Cover test page: the plan of the galleries drawn with a pen on paper (src/lib/pen). Walls, shelves and
	 * arrows are pen strokes; labels and notes are lettered into the same ink layers; both layers are multiplied
	 * onto the sheet so the paper's grain runs through the ink.
	 */
	import { onMount } from 'svelte';
	import {
		boardTransform,
		planoScene,
		PLANO_FONTS,
		ringLetters,
		type Mark
	} from '#lib/cover/plano.ts';
	import {
		compose,
		displace,
		inkLayer,
		makePaper,
		NIB,
		samplePath,
		seeded,
		stroke,
		type Pt
	} from '#lib/pen/pen.ts';

	let canvas: HTMLCanvasElement;

	const SEPIA: [number, number, number] = [92, 58, 34];
	const IRON_GALL: [number, number, number] = [40, 28, 20];

	function draw() {
		const dpr = Math.min(window.devicePixelRatio || 1, 2); // full resolution on retina screens
		const w = Math.round(innerWidth * dpr),
			h = Math.round(innerHeight * dpr);
		canvas.width = w;
		canvas.height = h;
		const { k, ox, oy } = boardTransform(w, h);
		const at = ([x, y]: Pt): Pt => [ox + x * k, oy + y * k];
		const scene = planoScene();
		const rnd = seeded(1941);
		const paper = makePaper(w, h, { scale: dpr });

		const draw = (layer: CanvasRenderingContext2D, marks: Mark[]) => {
			for (const m of marks.flatMap((m) => (m.kind === 'ring' ? ringLetters(layer, m) : [m]))) {
				const alpha = m.alpha ?? 1;
				const pen = {
					...NIB,
					width: 'w' in m ? m.w * k * 1.05 : 0,
					alpha: NIB.alpha * alpha
				};
				switch (m.kind) {
					case 'line': {
						// a plain, even line; its imperfection comes from displace() below, as in cover E
						const [a, b] = [at(m.a), at(m.b)];
						layer.globalAlpha = alpha;
						layer.lineWidth = m.w * k;
						layer.lineCap = 'round';
						layer.strokeStyle = '#000';
						layer.beginPath();
						layer.moveTo(a[0], a[1]);
						layer.lineTo(b[0], b[1]);
						layer.stroke();
						layer.globalAlpha = 1;
						break;
					}
					case 'circle': {
						const c = at(m.c),
							r = m.r * k,
							a0 = rnd() * Math.PI * 2;
						if (m.w > 0) {
							layer.globalAlpha = alpha;
							layer.lineWidth = m.w * k;
							layer.strokeStyle = '#000';
							layer.beginPath();
							layer.arc(c[0], c[1], r, a0, a0 + Math.PI * 2);
							layer.stroke();
							layer.globalAlpha = 1;
						} else {
							layer.globalAlpha = 0.8 * alpha;
							layer.beginPath();
							layer.arc(c[0], c[1], r, 0, Math.PI * 2);
							layer.fill();
							layer.globalAlpha = 1;
						}
						break;
					}
					case 'path':
						if (m.fill) {
							// a blot: a few overlapping passes of the same shape, each a little different
							for (let p = 0; p < 3; p++) {
								layer.save();
								layer.globalAlpha = 0.45 * alpha;
								const j = (rnd() - 0.5) * 1.2 * k;
								layer.setTransform(
									k * (1 + (rnd() - 0.5) * 0.04),
									0,
									0,
									k * (1 + (rnd() - 0.5) * 0.04),
									ox + j,
									oy + j
								);
								layer.fill(new Path2D(m.d));
								layer.restore();
							}
						} else
							for (const sub of m.d.split(/(?=M)/)) stroke(layer, samplePath(sub, at, 2), pen, rnd);
						break;
					case 'text': {
						// lettered twice with a hair's offset at partial opacity: soft, uneven edges, as ink wicks
						for (let p = 0; p < 2; p++) {
							layer.save();
							const [x, y] = at(m.at);
							layer.translate(x + (rnd() - 0.5) * 0.6, y + (rnd() - 0.5) * 0.6);
							if (m.rot) layer.rotate((m.rot * Math.PI) / 180);
							layer.font = m.font.replace('{s}', String(m.size * k));
							layer.textAlign = m.align ?? 'center';
							if (m.spacing) layer.letterSpacing = `${m.spacing * k}px`;
							layer.globalAlpha = 0.6 * alpha;
							layer.fillText(m.t, 0, 0);
							layer.restore();
						}
						break;
					}
				}
			}
		};

		const plan = inkLayer(w, h),
			notes = inkLayer(w, h);
		draw(plan.c, scene.plan);
		displace(plan.c, w, h, k); // the slightly imperfect line of cover E
		draw(notes.c, scene.notes);
		compose(canvas.getContext('2d')!, paper, [
			{ c: plan.c, ink: SEPIA, strength: 1.15 },
			{ c: notes.c, ink: IRON_GALL, strength: 1.1, tooth: 0.4 }
		]);
	}

	onMount(() => {
		let timer = 0;
		const redraw = () => {
			clearTimeout(timer);
			timer = window.setTimeout(draw, 200);
		};
		Promise.all(PLANO_FONTS.map((f) => document.fonts.load(f).catch(() => null))).then(draw);
		addEventListener('resize', redraw);
		return () => removeEventListener('resize', redraw);
	});
</script>

<svelte:head><title>Portada · La Ciudad de Babel</title></svelte:head>

<div class="stage">
	<canvas bind:this={canvas} aria-label="Plano de las galerías de la Ciudad de Babel"></canvas>
</div>

<style>
	/* the sheet is the screen */
	.stage {
		position: fixed;
		inset: 0;
		z-index: 10;
		background: #efe0bf;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
