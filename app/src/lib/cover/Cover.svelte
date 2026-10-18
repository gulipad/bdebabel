<script lang="ts">
	/**
	 * The cover: the plan of the galleries drawn with a pen on paper (src/lib/pen). Walls, shelves and
	 * arrows are pen strokes; labels and notes are lettered into the same ink layers; both layers are multiplied
	 * onto the sheet so the paper's grain runs through the ink. The galleries' bands of lettering come and go: a
	 * band inks in letter by letter, each letter melting in a patch at a time, stays a while, and melts away again,
	 * giving its shelves back, while others ink in elsewhere. The pointer wears the plan's ink away near it, and
	 * the plan is drawn back after it. The sheet arrives worn away and the plan melts in in patches, with no
	 * lettering yet; as it is nearly in, the clearing's lines start to stream, and once it is in, the heart of the
	 * clearing melts in (a dark pool of ink with the title left unstained in it); a little later the galleries'
	 * bands begin, and the ways into the city appear under the title.
	 * Within the clearing the pointer is gentler: it takes single words from its lines, and only a little from
	 * the heart.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		boardTransform,
		EXCERPTS,
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
		noise,
		pool,
		samplePath,
		seeded,
		stroke,
		type Pt
	} from '#lib/pen/pen.ts';
	import { livePool } from '#lib/pen/pool-gl.ts';
	import { handheld } from '#lib/ui/device.ts';
	import { meltAway, meltIn } from '#lib/ui/melt.ts';
	import { hasMovedWithin } from '#lib/ui/visit.ts';

	let canvas: HTMLCanvasElement, stage: HTMLDivElement;

	/** the bands on the go (a gallery, and when it began to ink in), and the frame that carries them on */
	let bands: { g: number; start: number }[] = [],
		recent: number[] = [],
		said: string[] = [], // excerpts the bands have shown lately
		raf = 0,
		still = false;
	const BANDS = 4, // bands on the sheet at once, at most
		WRITING = 2, // bands being written at once, at most
		GAP_MS = 3500, // ms at least between one band starting and the next (give or take a third)
		LETTER_MS = 130, // ms between letters along a band
		BLOOM_MS = 650, // ms for a letter to soak in
		HOLD_MS = 6000, // ms a band stays once written
		FADE_MS = 3500; // ms for it to fade
	const WEAR_REACH = 110, // board units: how far from the pointer the ink wears away
		EAT = 2.5, // how fast it wears, in full wear per second at the pointer
		REDRAW = 0.35, // how fast it is drawn back, per second (about three seconds from bare paper)
		CELL = 8, // sheet px per cell of the wear field
		WORD_REACH = 34, // board units: how near the pointer a word of the clearing's lines may be to go (the nearest)
		NEAR_REACH = 45, // board units: the pointer's reach in the heart of the clearing
		NEAR_EAT = 6, // how fast it wears there: almost at once
		HEART_CAP = 0.5, // the most the pointer takes from the heart
		TITLE_GUARD = 0.7, // how much of that the title and the ink right around it are spared
		CREEP_MS = 30000, // ms for the pool's edge to creep round and back to where it was
		DRIFT = 0.5; // how far its edge's noise flows (lattice cells, the radius of its circle)

	/** the ways into the city, under the title */
	const WAYS = [
		{ name: 'Teoría', to: '/teoria' },
		{ name: 'Buscar', to: '/buscar' },
		{ name: 'Ir', to: '/ir' }
	] as const;
	type Way = (typeof WAYS)[number]['to'];
	/** reaching the cover from inside the city: no entrance, everything melts in at once, quickly */
	const returning = hasMovedWithin();
	const RETURN_MS = 1400;
	let arriveAt = -Infinity;
	/** taking a way: everything melts away, quickly, then the way opens */
	const LEAVE_MS = 1100;
	let leaveAt = Infinity,
		leaving: Way | null = null;
	function take(to: Way) {
		if (leaving) return;
		leaving = to;
		leaveAt = performance.now();
		kick();
	}
	/** where the ways sit (css px: the board's centre, and px per board unit), and how far melted in (0..1) */
	let ways = $state({ x: 0, y: 0, k: 1 }),
		waysIn = $state(0);

	/** the pointer, in css px */
	const pointer = { x: 0, y: 0, in: false, onWays: false };
	/** asks for a frame when nothing else is drawing them (a still cover) */
	let kick = () => {};
	/** whether the sheet has made its entrance (it does once, not on every resize) */
	let entered = false;
	/** when the clearing's lines start streaming in, when its heart melts in, and when the bands may begin */
	let clearingAt = -Infinity,
		heartAt = -Infinity,
		bandsAt = -Infinity,
		melting = 0; // how much of the entrance's deepest wear is still to be drawn back
	const LEAD_MS = 2700, // ms before the plan has fully melted in that the clearing's lines start (the last of it is faint)
		CLEARING_MS = 45, // ms between letters of the clearing's lines, written as one loop, the outer line first
		HEART_AFTER = 900, // ms after the clearing's lines start that the heart melts in (by their fourth word)
		HEART_MS = 3500, // ms for the heart of the clearing to melt in, from the middle out
		FLOOD_LOBE = 55, // board units: the size of the broad lobes of the pool's front as it floods in
		FLOOD_SOFT = 0.22, // how soft that front is (wider: softer)
		WAYS_AFTER = 2000, // ms after the heart starts that the ways melt in, as the title finishes
		WAYS_MS = 1500, // ms for the ways to melt in
		BANDS_AFTER = 2000; // ms after the heart starts that the bands may begin, as the title has melted in
	/**
	 * #video: a loop for recording. It starts melting in at once; the clearing's lines are written at the pace
	 * that closes them just before the end; then everything melts away together, the reverse of its entrance
	 * and quicker, to bare paper.
	 */
	const LOOP_MS = 20000, // ms from the first frame to bare paper again
		OUT_SPEED = 1.6, // how much quicker the melting away is than the melting in
		END_PAUSE = 250; // ms between the last letter of the clearing's lines and the melting away
	/** in the loop: when it started (the first frame), and the cues it has passed, for the sound */
	let loopStart = -Infinity;

	const sheet = (w: number, h: number) => {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		return c.getContext('2d')!;
	};

	const SEPIA: [number, number, number] = [92, 58, 34];
	const IRON_GALL: [number, number, number] = [40, 28, 20];

	/** the faces the lettering needs, loading; and which render is the latest (an older one stops when it sees) */
	let fonts: Promise<unknown> = Promise.resolve(),
		generation = 0;
	const painted = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r)));

	async function render() {
		cancelAnimationFrame(raf);
		const gen = ++generation;
		const dpr = Math.min(window.devicePixelRatio || 1, 2); // full resolution on retina screens
		const w = Math.round(innerWidth * dpr),
			h = Math.round(innerHeight * dpr);
		canvas.width = w;
		canvas.height = h;
		const { k, ox, oy } = boardTransform(w, h);
		const at = ([x, y]: Pt): Pt => [ox + x * k, oy + y * k];
		// #video: for recording a sneak peek; the title alone in the heart, no ways, and a sign when it is ready
		const video = location.hash.includes('video');
		const scene = planoScene({ ways: !video });
		const rnd = seeded(1941);
		const paper = makePaper(w, h, { scale: dpr });
		const bare = sheet(w, h);
		compose(bare, paper, []);
		// the first time, the sheet shows at once, bare (the entrance starts from it), while the rest is built
		if (!entered) {
			canvas.getContext('2d')!.drawImage(bare.canvas, 0, 0);
			await painted();
		}
		await fonts;
		if (gen !== generation) return;

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
			inner = inkLayer(w, h), // the lines around the clearing, which nothing wears away
			notes = inkLayer(w, h),
			shelves = inkLayer(w, h),
			letters = inkLayer(w, h);
		draw(
			plan.c,
			scene.plan.filter((m) => m.kind !== 'ring')
		);
		displace(plan.c, w, h, k); // the slightly imperfect line of cover E
		draw(
			inner.c,
			scene.plan.filter((m) => m.kind === 'ring')
		);
		displace(inner.c, w, h, k);
		draw(notes.c, scene.notes);
		draw(
			shelves.c,
			scene.lettering.flatMap((g) => g.shelves)
		);
		displace(shelves.c, w, h, k);
		draw(
			letters.c,
			scene.lettering.map((g) => g.ring)
		);
		displace(letters.c, w, h, k);
		// the sheet with every lettered gallery's shelves, and with its band instead; a mask per band shows the second
		const layers = [
			{ c: plan.c, ink: SEPIA, strength: 1.15 },
			{ c: notes.c, ink: IRON_GALL, strength: 1.1, tooth: 0.4 }
		];
		const before = sheet(w, h),
			after = sheet(w, h);
		compose(before, paper, [...layers, { c: shelves.c, ink: SEPIA, strength: 1.15 }]);
		// white paper with the same tooth, for sheets of ink alone that are multiplied on later
		const white = { ...paper, rgb: new Uint8ClampedArray(w * h * 3).fill(255) };

		// wearing the ink away: a coarse field of wear, and the order the ink goes in, blotchy and raised fibres first
		ways = {
			x: (ox + scene.centre.c[0] * k) / dpr,
			y: (oy + scene.centre.c[1] * k) / dpr,
			k: k / dpr
		};
		// the clearing's lines as ink alone, to multiply on top of everything once they stream in
		const innerInk = sheet(w, h);

		const gw = Math.ceil(w / CELL) + 2,
			gh = Math.ceil(h / CELL) + 2,
			wear = new Float32Array(gw * gh);
		const hw = Math.ceil(w / 2),
			hh = Math.ceil(h / 2);
		const order = new Float32Array(hw * hh);
		{
			const hash = (i: number, j: number) => {
				const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
				return v - Math.floor(v);
			};
			const blotch = 14 * k; // sheet px per noise cell
			for (let y = 0; y < hh; y++)
				for (let x = 0; x < hw; x++) {
					const u = (x * 2) / blotch,
						v = (y * 2) / blotch,
						i = Math.floor(u),
						j = Math.floor(v),
						fx = u - i,
						fy = v - j;
					const sx = fx * fx * (3 - 2 * fx),
						sy = fy * fy * (3 - 2 * fy);
					const a = hash(i, j) + (hash(i + 1, j) - hash(i, j)) * sx,
						b = hash(i, j + 1) + (hash(i + 1, j + 1) - hash(i, j + 1)) * sx;
					order[y * hw + x] = 0.6 * (a + (b - a) * sy) + 0.4 * (1 - paper.grain[y * 2 * w + x * 2]);
				}
		}
		// the entrance: worn everywhere, deeper in some broad patches, so the plan melts in a patch at a time
		let deepest = 0;
		const deep = new Float32Array(gw * gh); // the entrance's wear, which melting away retraces
		{
			const hash = (i: number, j: number) => {
				const v = Math.sin(i * 269.5 + j * 183.3) * 43758.5453;
				return v - Math.floor(v);
			};
			const patch = (110 * k) / CELL; // wear cells per patch
			for (let j = 0; j < gh; j++)
				for (let i = 0; i < gw; i++) {
					const u = i / patch,
						v = j / patch,
						a = Math.floor(u),
						b = Math.floor(v),
						fx = u - a,
						fy = v - b,
						sx = fx * fx * (3 - 2 * fx),
						sy = fy * fy * (3 - 2 * fy);
					const top = hash(a, b) + (hash(a + 1, b) - hash(a, b)) * sx,
						bot = hash(a, b + 1) + (hash(a + 1, b + 1) - hash(a, b + 1)) * sx;
					// (in the loop it starts sooner: the shallowest patches are drawn from the first frame)
					deep[j * gw + i] = (video ? 0.85 : 1.05) + 0.9 * (top + (bot - top) * sy);
				}
			if (!still && !entered) {
				// (coming back, only a light wear: the plan is in within the moment the lettering takes)
				if (returning) for (let n = 0; n < deep.length; n++) wear[n] = deep[n] * 0.25;
				else wear.set(deep);
				deepest = deep.reduce((a, b) => Math.max(a, b), 0);
			}
		}
		const deepMax = deep.reduce((a, b) => Math.max(a, b), 0);
		// the lettering waits for the plan to melt in: wearAway() says when it has, keeping pace with the wear itself
		// (frames can run slower than the clock); a resize mid-entrance, which starts the wear afresh, ends it
		const lettersFrom = (t: number) => {
			melting = 0;
			clearingAt = Math.min(clearingAt, t - LEAD_MS);
			heartAt = clearingAt + HEART_AFTER;
			bandsAt = heartAt + BANDS_AFTER;
		};
		if (still) [clearingAt, heartAt, bandsAt] = [-Infinity, -Infinity, -Infinity];
		else if (!entered && returning) {
			arriveAt = performance.now();
			[clearingAt, heartAt, bandsAt] = [-Infinity, -Infinity, arriveAt + RETURN_MS + 600];
		} else if (!entered && deepest > 0) {
			melting = deepest;
			[clearingAt, heartAt, bandsAt] = [Infinity, Infinity, Infinity];
		} else if (!entered || melting > 0) lettersFrom(performance.now());
		entered = true;
		const lift = new ImageData(hw, hh),
			liftC = sheet(hw, hh);
		let last = performance.now();

		// one drop per letter, at the middle of its body, due in turn along its line (ms after the line starts)
		type Drop = {
			x: number;
			y: number;
			r: number;
			due: number;
			/** ms to melt in */ dur?: number;
			/** which word of its strand the letter belongs to */ word?: number;
		};
		const drnd = seeded(7);
		const dropsOf = (ring: Extract<Mark, { kind: 'ring' }>, step: number, lag = 0): Drop[] =>
			ringLetters(letters.c, ring).flatMap((m, i) => {
				if (m.kind !== 'text') return [];
				const r = ((m.rot ?? 0) * Math.PI) / 180,
					[x, y] = at(m.at),
					lift = m.size * 0.32 * k;
				return [
					{
						x: x + Math.sin(r) * lift,
						y: y - Math.cos(r) * lift,
						r: m.size * 0.9 * k,
						due: lag + i * step + drnd() * 40,
						word: m.word
					}
				];
			});
		/**
		 * Letters that melt in together, dissolving like the wear: a half-resolution mask over them (at x0, y0 in
		 * sheet px), where every pixel belongs to its nearest letter and shows once that letter's presence passes
		 * the pixel's place in the order; and when they are all written.
		 */
		interface Strand {
			drops: Drop[];
			x0: number;
			y0: number;
			sw: number;
			sh: number;
			written: number;
			field?: { idx: Int16Array; wgt: Float32Array; ord: Float32Array; flow?: Float32Array };
			/**
			 * for a large pool of ink rather than letters: the order in which it floods in (0..1 per sheet px),
			 * revealed with a soft front, while the pointer still wears it in the fine, grainy order
			 */
			flood?: (x: number, y: number) => number;
			mask?: { c: CanvasRenderingContext2D; img: ImageData; dry: boolean };
			/** a full-resolution sheet the size of the mask, for inking through it */
			spot?: CanvasRenderingContext2D;
		}
		const strandOf = (drops: Drop[]): Strand => {
			const pad = Math.max(0, ...drops.map((d) => d.r)) + 2,
				xs = drops.map((d) => d.x),
				ys = drops.map((d) => d.y);
			const x0 = 2 * Math.floor((Math.min(...xs) - pad) / 2) || 0,
				y0 = 2 * Math.floor((Math.min(...ys) - pad) / 2) || 0;
			return {
				drops,
				x0,
				y0,
				sw: Math.max(1, Math.ceil((Math.max(...xs) + pad - x0) / 2) || 1),
				sh: Math.max(1, Math.ceil((Math.max(...ys) + pad - y0) / 2) || 1),
				written: Math.max(0, ...drops.map((d) => d.due + (d.dur ?? BLOOM_MS)))
			};
		};
		const fieldOf = (st: Strand) => {
			if (st.field) return st.field;
			const n = st.sw * st.sh,
				best = new Float32Array(n).fill(Infinity);
			const f: NonNullable<Strand['field']> = {
				idx: new Int16Array(n).fill(-1),
				wgt: new Float32Array(n),
				ord: new Float32Array(n).fill(1)
			};
			// each letter claims the mask pixels it is nearest to, within its reach
			st.drops.forEach((d, i) => {
				const bx0 = Math.max(0, Math.floor((d.x - d.r - st.x0) / 2)),
					bx1 = Math.min(st.sw - 1, Math.ceil((d.x + d.r - st.x0) / 2)),
					by0 = Math.max(0, Math.floor((d.y - d.r - st.y0) / 2)),
					by1 = Math.min(st.sh - 1, Math.ceil((d.y + d.r - st.y0) / 2));
				for (let by = by0; by <= by1; by++)
					for (let bx = bx0; bx <= bx1; bx++) {
						const p = by * st.sw + bx,
							u = Math.hypot(st.x0 + bx * 2 + 1 - d.x, st.y0 + by * 2 + 1 - d.y) / d.r;
						if (u < 1 && u < best[p]) {
							best[p] = u;
							f.idx[p] = i;
							f.wgt[p] = Math.min(1, (1 - u) * 3);
						}
					}
			});
			for (let by = 0; by < st.sh; by++)
				for (let bx = 0; bx < st.sw; bx++) {
					const ox = st.x0 / 2 + bx,
						oy = st.y0 / 2 + by;
					if (ox >= 0 && oy >= 0 && ox < hw && oy < hh)
						f.ord[by * st.sw + bx] = order[oy * hw + ox];
				}
			if (st.flood) {
				const flow = new Float32Array(n);
				for (let by = 0; by < st.sh; by++)
					for (let bx = 0; bx < st.sw; bx++)
						flow[by * st.sw + bx] = st.flood(st.x0 + bx * 2 + 1, st.y0 + by * 2 + 1);
				f.flow = flow;
				f.wgt.fill(1);
			}
			return (st.field = f);
		};
		/**
		 * What the pointer has taken from a strand, up to `cap`: per letter (0..1), or per place (sheet px).
		 */
		type Touch = {
			letters?: Float32Array;
			place?: (x: number, y: number) => number;
			cap: number;
			/** per mask pixel, the part of `cap` it is spared (0..1) */
			guard?: Float32Array;
			on: boolean;
		};
		/** The strand's mask at `e` ms after it started, with `going` (1..0) of it left as it melts away. */
		const maskOf = (st: Strand, e: number, going: number, touch?: Touch) => {
			if (!st.mask) {
				const c = sheet(st.sw, st.sh);
				st.mask = { c, img: c.createImageData(st.sw, st.sh), dry: false };
			}
			const m = st.mask;
			// once written and until it starts to go, a strand's mask stands still
			const settled = e >= st.written && going === 1 && !touch?.on;
			if (m.dry && settled) return m.c;
			const f = fieldOf(st),
				here = st.drops.map(
					(d, i) =>
						Math.min(going, Math.max(0, Math.min(1, (e - d.due) / (d.dur ?? BLOOM_MS)))) *
						(1 - (touch?.letters ? touch.cap * touch.letters[i] : 0))
				),
				place = touch?.on ? touch.place : undefined,
				a = m.img.data;
			for (let p = 0; p < st.sw * st.sh; p++) {
				const i = f.idx[p];
				if (i < 0) {
					a[p * 4 + 3] = 0;
					continue;
				}
				let v = here[i] * f.wgt[p];
				if (place)
					v *=
						1 -
						touch!.cap *
							(1 - (touch!.guard?.[p] ?? 0)) *
							place(st.x0 + (p % st.sw) * 2 + 1, st.y0 + Math.floor(p / st.sw) * 2 + 1);
				if (f.flow) {
					// the flood's front, soft and wandering; then what the pointer has worn, in the grainy order
					// (coming in it slows as it spreads; going, it draws back steadily, from the whole of it at 0.75)
					const come = going < 1 ? here[i] * 1.09 : 1 - (1 - here[i]) ** 1.7,
						s = Math.min(1, Math.max(0, (come * 1.3 - f.flow[p] + 0.04) / FLOOD_SOFT)),
						w = Math.min(1, Math.max(0, (v / (here[i] || 1)) * 1.25 - f.ord[p] + 0.08) / 0.16);
					a[p * 4 + 3] = s * s * (3 - 2 * s) * w * w * (3 - 2 * w) * 255;
					continue;
				}
				const t = Math.min(1, Math.max(0, (v * 1.25 - f.ord[p] + 0.08) / 0.16));
				a[p * 4 + 3] = t * t * (3 - 2 * t) * 255;
			}
			m.c.putImageData(m.img, 0, 0);
			m.dry = settled;
			return m.c;
		};
		const strands = scene.lettering.map((g) => strandOf(dropsOf(g.ring, LETTER_MS)));
		const written = strands.map((st) => st.written);
		const life = (g: number) => written[g] + HOLD_MS + FADE_MS;
		const clearingDrops = (step: number) =>
			scene.plan
				.filter((m) => m.kind === 'ring')
				.reduce<Drop[]>((ds, m) => {
					const lag = ds.length ? ds[ds.length - 1].due + step : 0,
						words = ds.length ? (ds[ds.length - 1].word ?? 0) + 1 : 0;
					return [
						...ds,
						...dropsOf(m, step, lag).map((d) => ({ ...d, word: (d.word ?? 0) + words }))
					];
				}, []);
		// in the loop, the lines are written at the pace that ends them just before the melting away: they start
		// LEAD_MS before the plan is in (which takes deepest / REDRAW), and the melting away takes outGoes
		const outGoes = video ? (deepest / (REDRAW * OUT_SPEED)) * 1000 : LEAVE_MS;
		const loopStep = !video
			? CLEARING_MS
			: (() => {
					const n = clearingDrops(1).length,
						from = (deepest / REDRAW) * 1000 - LEAD_MS;
					return (LOOP_MS - from - 40 - BLOOM_MS - END_PAUSE - outGoes) / Math.max(1, n - 1);
				})();
		const clearing = strandOf(clearingDrops(loopStep));

		// the heart of the clearing: the title, either left unstained in a pool of ink or written in ink alone
		const [hx, hy] = at(scene.centre.c),
			hr = scene.centre.r * k;
		// it melts in from the middle out, as one drop reaching the whole of it
		const heart = strandOf([{ x: hx, y: hy, r: hr * 1.6, due: 0, dur: HEART_MS }]);
		// floods outward from the middle with a wandering front: broad lobes, finer inlets, a hint of the fibres
		heart.flood = (x, y) => {
			const u = k * FLOOD_LOBE;
			return (
				0.02 +
				0.82 * Math.min(1, Math.hypot(x - hx, y - hy) / (hr * 1.12)) +
				0.3 * (noise(x / u, y / u, 31) - 0.5) +
				0.12 * (noise((x * 3) / u, (y * 3) / u, 37) - 0.5) +
				0.05 *
					(paper.grain[
						Math.min(h - 1, Math.max(0, y | 0)) * w + Math.min(w - 1, Math.max(0, x | 0))
					] -
						0.5)
			);
		};
		// each sheet of ink is only needed where its strands are: the bands' galleries, the clearing, its heart
		const rectOf = (st: Strand) => ({ x: st.x0, y: st.y0, w: st.sw * 2, h: st.sh * 2 });
		compose(
			after,
			paper,
			[...layers, { c: letters.c, ink: SEPIA, strength: 1.15 }],
			strands.map(rectOf)
		);
		compose(innerInk, white, [{ c: inner.c, ink: SEPIA, strength: 1.15 }], [rectOf(clearing)]);
		const titled = inkLayer(w, h);
		draw(titled.c, scene.centre.title);
		const heartInk = sheet(w, h),
			hrect = rectOf(heart);
		// the noise the pool's edge wanders by flows round a circle, so its edge creeps and comes back
		const drift = (now: number): [number, number] => {
			const a = ((still ? 0 : now) / CREEP_MS) * Math.PI * 2;
			return [DRIFT * (1 + Math.cos(a)), DRIFT * (1 + Math.sin(a))];
		};
		// the heart's ink: the pool, drawn live on the GPU so it can creep (or, without it, once, still)
		const live = livePool(paper, {
			cx: hx,
			cy: hy,
			r: hr,
			unit: k,
			reserve: titled.c,
			rect: hrect,
			ink: IRON_GALL
		});
		if (!live) {
			const pond = inkLayer(w, h);
			pool(pond.c, paper, { cx: hx, cy: hy, r: hr, unit: k, reserve: titled.c, drift: drift(0) });
			compose(heartInk, white, [{ c: pond.c, ink: IRON_GALL, strength: 1, tooth: 0.5 }], [hrect]);
		}
		// the title, and the ink right around it, are spared most of what the pointer takes from the heart
		const titleGuard = (() => {
			const g = sheet(heart.sw, heart.sh);
			g.filter = `blur(${1.5 * k}px)`;
			g.drawImage(
				titled.canvas,
				heart.x0,
				heart.y0,
				heart.sw * 2,
				heart.sh * 2,
				0,
				0,
				heart.sw,
				heart.sh
			);
			const a = g.getImageData(0, 0, heart.sw, heart.sh).data,
				out = new Float32Array(heart.sw * heart.sh);
			for (let p = 0; p < out.length; p++)
				out[p] = Math.min(1, (a[p * 4 + 3] / 255) * 2) * TITLE_GUARD;
			return out;
		})();

		// a strand's ink, through its mask, multiplied onto the sheet on top of everything (nothing wears it away)
		const inkThrough = (
			st: Strand,
			e: number,
			ink: { canvas: CanvasImageSource },
			touch?: Touch,
			/** where `ink` sits on the sheet, when it is smaller than the sheet */
			[ix, iy] = [0, 0],
			going = 1
		) => {
			if (e <= 0 || !st.drops.length) return;
			const [W, H] = [st.sw * 2, st.sh * 2];
			const spot = (st.spot ??= sheet(W, H));
			spot.globalCompositeOperation = 'copy';
			spot.drawImage(maskOf(st, e, going, touch).canvas, 0, 0, W, H);
			spot.globalCompositeOperation = 'source-in';
			spot.drawImage(ink.canvas, st.x0 - ix, st.y0 - iy, W, H, 0, 0, W, H);
			out.globalCompositeOperation = 'multiply';
			out.drawImage(spot.canvas, st.x0, st.y0);
			out.globalCompositeOperation = 'source-over';
		};
		// the pointer in the clearing: whole words of its lines go (and are drawn back), one at a time as it passes;
		// in the heart, a small field of wear, of which only a part is ever taken
		const wordsWorn = new Float32Array((clearing.drops.at(-1)?.word ?? 0) + 1);
		const lineTouch: Touch = {
			letters: new Float32Array(clearing.drops.length),
			cap: 1,
			on: false
		};
		const near = {
			x0: heart.x0,
			y0: heart.y0,
			cw: Math.ceil((heart.sw * 2) / CELL) + 2,
			ch: Math.ceil((heart.sh * 2) / CELL) + 2
		};
		const nearWear = new Float32Array(near.cw * near.ch);
		const heartTouch: Touch = {
			cap: HEART_CAP,
			guard: titleGuard,
			on: false,
			place: (x, y) => {
				const gx = (x - near.x0) / CELL,
					gy = (y - near.y0) / CELL,
					i = Math.floor(gx),
					j = Math.floor(gy);
				if (i < 0 || j < 0 || i >= near.cw - 1 || j >= near.ch - 1) return 0;
				const fx = gx - i,
					fy = gy - j,
					n = j * near.cw + i;
				return (
					(nearWear[n] * (1 - fx) + nearWear[n + 1] * fx) * (1 - fy) +
					(nearWear[n + near.cw] * (1 - fx) + nearWear[n + near.cw + 1] * fx) * fy
				);
			}
		};
		const touchCentre = (dt: number) => {
			const px = pointer.x * dpr,
				py = pointer.y * dpr,
				reach = WORD_REACH * k;
			const hot = new Uint8Array(wordsWorn.length);
			// only the word nearest the pointer goes, if it is within reach
			if (pointer.in && !pointer.onWays) {
				let best = reach,
					word = -1;
				for (const d of clearing.drops) {
					const u = Math.hypot(d.x - px, d.y - py);
					if (u < best) [best, word] = [u, d.word ?? 0];
				}
				if (word >= 0) hot[word] = 1;
			}
			let on = false;
			for (let wd = 0; wd < wordsWorn.length; wd++) {
				const v = hot[wd] ? wordsWorn[wd] + dt * EAT : wordsWorn[wd] - dt * REDRAW;
				wordsWorn[wd] = Math.min(1, Math.max(0, v));
				on ||= wordsWorn[wd] > 0;
			}
			// one frame more after the last word comes back, so the mask is redrawn whole
			lineTouch.on = on || lineTouch.on;
			if (!on && lineTouch.on) lineTouch.on = lineTouch.letters!.some((v) => v > 0);
			clearing.drops.forEach((d, i) => (lineTouch.letters![i] = wordsWorn[d.word ?? 0]));
			const gx = (px - near.x0) / CELL,
				gy = (py - near.y0) / CELL,
				rc = (NEAR_REACH * k) / CELL,
				pressing = pointer.in && !pointer.onWays;
			let hon = false;
			for (let j = 0; j < near.ch; j++)
				for (let i = 0; i < near.cw; i++) {
					const n = j * near.cw + i;
					let v = nearWear[n] - dt * REDRAW;
					if (pressing) {
						const u = Math.hypot(i - gx, j - gy) / rc;
						if (u < 1) v += dt * NEAR_EAT * (1 - u * u) ** 2;
					}
					nearWear[n] = Math.min(1, Math.max(0, v));
					hon ||= nearWear[n] > 0;
				}
			heartTouch.on = hon;
		};

		// a band takes a new excerpt each time it appears: its letters are drawn afresh, in its own gallery only
		const scratch = inkLayer(w, h);
		const reletter = (g: number, t: string) => {
			const gal = scene.lettering[g];
			gal.ring = { ...gal.ring, t };
			const was = rectOf(strands[g]);
			strands[g] = strandOf(dropsOf(gal.ring, LETTER_MS));
			written[g] = strands[g].written;
			const now = rectOf(strands[g]),
				x = Math.min(was.x, now.x),
				y = Math.min(was.y, now.y),
				r = {
					x,
					y,
					w: Math.max(was.x + was.w, now.x + now.w) - x,
					h: Math.max(was.y + was.h, now.y + now.h) - y
				};
			scratch.c.clearRect(r.x, r.y, r.w, r.h);
			draw(scratch.c, [gal.ring]);
			displace(scratch.c, w, h, k, {}, r);
			// within the gallery's hexagon, a little past the tops of the letters, so its neighbours are untouched
			const [gx, gy] = at(gal.c),
				pts = gal.ring.pts.map(at),
				apothem = Math.hypot((pts[0][0] + pts[1][0]) / 2 - gx, (pts[0][1] + pts[1][1]) / 2 - gy),
				f = (apothem + (gal.ring.size * 0.72 + 1.5) * k) / apothem;
			letters.c.save();
			letters.c.beginPath();
			for (const [px, py] of pts) letters.c.lineTo(gx + (px - gx) * f, gy + (py - gy) * f);
			letters.c.closePath();
			letters.c.clip();
			letters.c.clearRect(r.x, r.y, r.w, r.h);
			letters.c.drawImage(scratch.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
			letters.c.restore();
			compose(after, paper, [...layers, { c: letters.c, ink: SEPIA, strength: 1.15 }], [r]);
		};

		const far = (g: number) =>
			bands.every(
				(b) =>
					Math.hypot(
						scene.lettering[b.g].c[0] - scene.lettering[g].c[0],
						scene.lettering[b.g].c[1] - scene.lettering[g].c[1]
					) >=
					66 * 1.732 * 1.6
			);

		const out = canvas.getContext('2d')!,
			mask = sheet(w, h);
		// the loop's end: the plan melts away retracing its entrance, ending on bare paper as the loop restarts;
		// the heart goes first, then the clearing's lines
		const outroAt = () => (video ? clearingAt + clearing.written + END_PAUSE : leaveAt);
		const ending = () => video || leaveAt < Infinity;
		// (scaled so the letters and the heart visibly start to go at once, as the plan does: until about 0.75 of
		// them is taken, nothing shows)
		const left = (now: number) =>
			!ending() || now < outroAt() ? 1 : 0.75 * (1 - Math.min(1, (now - outroAt()) / outGoes));
		const frame = (now: number) => {
			if (video && loopStart === -Infinity) loopStart = now;
			if (video && heartAt < Infinity && !document.documentElement.dataset.cues)
				document.documentElement.dataset.cues = JSON.stringify({
					start: loopStart,
					clearing: clearingAt,
					heart: heartAt,
					outro: outroAt(),
					end: outroAt() + outGoes
				});
			if (still) bands = scene.opening.map((g) => ({ g, start: now - written[g] }));
			else {
				// bands that have faded make way for new ones, in galleries away from the others and not just used
				bands = bands.filter((b) => now - b.start < life(b.g));
				// (a band waiting to start counts as being written)
				const writing = () => bands.filter((b) => now - b.start < written[b.g]).length;
				while (bands.length < BANDS && writing() < WRITING && bandsAt < Infinity && !leaving) {
					const free = scene.lettering
						.map((_, i) => i)
						.filter((i) => !recent.includes(i) && far(i));
					if (!free.length) break;
					const g = free[Math.floor(Math.random() * free.length)];
					// an excerpt not on the sheet now nor shown lately
					const showing = bands.map((b) => scene.lettering[b.g].ring.t),
						fresh = EXCERPTS.filter((t) => !showing.includes(t) && !said.includes(t));
					const t = fresh[Math.floor(Math.random() * fresh.length)] ?? EXCERPTS[0];
					said = [t, ...said].slice(0, 10);
					reletter(g, t);
					const last = Math.max(-Infinity, ...bands.map((b) => b.start)),
						start = Math.max(now + 300, bandsAt, last + GAP_MS * (0.7 + Math.random() * 0.6));
					// in the loop, only bands that are written by the time everything melts away
					if (video && start + written[g] > outroAt()) break;
					bands.push({ g, start });
					recent = [g, ...recent].slice(0, 3);
				}
			}
			out.drawImage(before.canvas, 0, 0);
			mask.globalCompositeOperation = 'source-over';
			mask.clearRect(0, 0, w, h);
			for (const b of bands) {
				const e = now - b.start;
				if (e < 0) continue;
				const st = strands[b.g],
					going = 1 - Math.min(1, Math.max(0, e - st.written - HOLD_MS) / FADE_MS);
				mask.drawImage(maskOf(st, e, going).canvas, st.x0, st.y0, st.sw * 2, st.sh * 2);
			}
			mask.globalCompositeOperation = 'source-in';
			mask.drawImage(after.canvas, 0, 0);
			out.drawImage(mask.canvas, 0, 0);

			wearAway(now);

			// the clearing's lines, streaming in once the plan is drawn, untouched by the wear: multiplied on top
			// coming back, the heart and the lines melt in together with the plan, in the same moment
			const arrived = Math.min(1, ((now - arriveAt) / RETURN_MS) * 1.33),
				heartLeft = Math.min(left(now), arrived);
			if (live) {
				live.draw(drift(now));
				inkThrough(heart, now - heartAt, live, heartTouch, [hrect.x, hrect.y], heartLeft);
			} else inkThrough(heart, now - heartAt, heartInk, heartTouch, [0, 0], heartLeft);
			inkThrough(
				clearing,
				now - clearingAt,
				innerInk,
				lineTouch,
				[0, 0],
				Math.min(left(now), arrived)
			);
			// the ways melt in as the title finishes
			const wi = leaving
				? Math.min(waysIn, 1 - Math.min(1, (now - leaveAt) / (outGoes * 0.6)))
				: arriveAt > -Infinity
					? Math.min(1, Math.max(0, (now - arriveAt) / RETURN_MS))
					: Math.min(1, Math.max(0, (now - heartAt - WAYS_AFTER) / WAYS_MS));
			if (wi !== waysIn) waysIn = wi;
			// once everything has melted away, the way opens
			if (leaving && now - leaveAt >= outGoes) {
				const to = leaving;
				leaving = null;
				goto(resolve(to));
				return;
			}
			if (!still || worn || lineTouch.on || heartTouch.on) raf = requestAnimationFrame(frame);
		};
		// the pointer wears the field down near it, steeply less with distance, and the pen draws it back everywhere
		let worn = false;
		const wearAway = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (melting > 0) {
				melting -= dt * REDRAW;
				// the structure can be told a little before it is all in: the clearing's lines start then
				if (clearingAt === Infinity && melting <= (LEAD_MS / 1000) * REDRAW) {
					clearingAt = now;
					heartAt = now + HEART_AFTER;
				}
				if (melting <= 0) lettersFrom(now);
			}
			touchCentre(dt);
			const px = (pointer.x * dpr) / CELL,
				py = (pointer.y * dpr) / CELL,
				rc = (WEAR_REACH * k) / CELL;
			let x0 = gw,
				y0 = gh,
				x1 = -1,
				y1 = -1;
			for (let j = 0; j < gh; j++)
				for (let i = 0; i < gw; i++) {
					const n = j * gw + i;
					let v = wear[n] - dt * REDRAW;
					// the loop's end: the wear rises again where it last fell, past bare paper
					if (ending() && now >= outroAt())
						v = Math.max(v, deep[n] + 0.15 - deepMax * (1 - (now - outroAt()) / outGoes));
					if (pointer.in) {
						const u = Math.hypot(i - px, j - py) / rc;
						// wearing tops out at bare paper; the entrance's deeper wear is left to come back on its own
						if (u < 1) v = Math.max(v, Math.min(1, v + dt * EAT * (1 - u * u) ** 2));
					}
					v = Math.max(0, v);
					wear[n] = v;
					if (v > 0) {
						x0 = Math.min(x0, i);
						y0 = Math.min(y0, j);
						x1 = Math.max(x1, i);
						y1 = Math.max(y1, j);
					}
				}
			worn = x1 >= 0;
			if (!worn) return;
			// the ink goes where the wear passes its place in the order, with a soft edge
			const d = lift.data,
				step = CELL / 2,
				X0 = Math.max(0, (x0 - 1) * step),
				Y0 = Math.max(0, (y0 - 1) * step),
				X1 = Math.min(hw, (x1 + 2) * step),
				Y1 = Math.min(hh, (y1 + 2) * step);
			// a cell at a time: one with no wear is left alone, one worn past every place in the order is bare
			for (let j = Math.floor(Y0 / step); j * step < Y1; j++)
				for (let i = Math.floor(X0 / step); i * step < X1; i++) {
					const n = j * gw + i,
						c00 = wear[n],
						c10 = wear[n + 1],
						c01 = wear[n + gw],
						c11 = wear[n + gw + 1];
					const lo = Math.min(c00, c10, c01, c11),
						hi = Math.max(c00, c10, c01, c11),
						flat = hi === 0 ? 0 : lo >= 0.87 ? 255 : -1;
					for (let y = Math.max(Y0, j * step); y < Math.min(Y1, (j + 1) * step); y++)
						for (let x = Math.max(X0, i * step); x < Math.min(X1, (i + 1) * step); x++) {
							const p = (y * hw + x) * 4 + 3;
							if (flat >= 0) {
								d[p] = flat;
								continue;
							}
							const fx = x / step - i,
								fy = y / step - j;
							const v = (c00 * (1 - fx) + c10 * fx) * (1 - fy) + (c01 * (1 - fx) + c11 * fx) * fy;
							const t = Math.min(1, Math.max(0, (v * 1.25 - order[y * hw + x] + 0.08) / 0.16));
							d[p] = t * t * (3 - 2 * t) * 255;
						}
				}
			liftC.putImageData(lift, 0, 0, X0, Y0, X1 - X0, Y1 - Y0);
			mask.globalCompositeOperation = 'copy';
			mask.drawImage(
				liftC.canvas,
				X0,
				Y0,
				X1 - X0,
				Y1 - Y0,
				X0 * 2,
				Y0 * 2,
				(X1 - X0) * 2,
				(Y1 - Y0) * 2
			);
			mask.globalCompositeOperation = 'source-in';
			mask.drawImage(
				bare.canvas,
				X0 * 2,
				Y0 * 2,
				(X1 - X0) * 2,
				(Y1 - Y0) * 2,
				X0 * 2,
				Y0 * 2,
				(X1 - X0) * 2,
				(Y1 - Y0) * 2
			);
			mask.globalCompositeOperation = 'source-over';
			out.drawImage(
				mask.canvas,
				X0 * 2,
				Y0 * 2,
				(X1 - X0) * 2,
				(Y1 - Y0) * 2,
				X0 * 2,
				Y0 * 2,
				(X1 - X0) * 2,
				(Y1 - Y0) * 2
			);
		};
		kick = () => {
			if (still) {
				cancelAnimationFrame(raf);
				raf = requestAnimationFrame(frame);
			}
		};
		frame(performance.now());
		if (video) document.documentElement.dataset.ready = '1';
	}

	onMount(() => {
		let timer = 0;
		// resizing: the sheet melts away at once, is drawn again for the new size, and melts back in
		// (only the last resize brings it back, once the sheet for the final size is drawn)
		let away: Promise<void> | null = null,
			last = 0;
		const redraw = () => {
			away ??= meltAway(stage, 260);
			clearTimeout(timer);
			timer = window.setTimeout(async () => {
				const mine = ++last;
				await away;
				await render();
				if (mine !== last) return;
				away = null;
				meltIn(stage, 650);
			}, 220);
		};
		fonts = Promise.all(PLANO_FONTS.map((f) => document.fonts.load(f).catch(() => null)));
		// with reduced motion the lettering is simply there, and stays (on a desktop: a phone or a tablet melts
		// it in anyway, as it always melted away)
		still = matchMedia('(prefers-reduced-motion: reduce)').matches && !handheld();
		render();
		const move = (e: PointerEvent) => {
			if (e.pointerType === 'touch') return;
			Object.assign(pointer, { x: e.clientX, y: e.clientY, in: true });
			kick();
		};
		const leave = () => {
			pointer.in = false;
			kick();
		};
		addEventListener('resize', redraw);
		addEventListener('hashchange', render);
		addEventListener('pointermove', move);
		document.documentElement.addEventListener('pointerleave', leave);
		return () => {
			removeEventListener('resize', redraw);
			removeEventListener('hashchange', render);
			removeEventListener('pointermove', move);
			document.documentElement.removeEventListener('pointerleave', leave);
			cancelAnimationFrame(raf);
		};
	});
</script>

<div class="stage" bind:this={stage}>
	<canvas bind:this={canvas} aria-label="Plano de las galerías de la Ciudad de Babel"></canvas>
	<!-- the ways melt in like the ink: a blotchy, grainy noise that passes a threshold rising with `waysIn` -->
	<svg class="defs" aria-hidden="true">
		<filter id="ways-melt" x="-10%" y="-20%" width="120%" height="140%">
			<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="4" seed="7" />
			<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" />
			<feComponentTransfer result="melt">
				<feFuncA type="linear" slope="8" intercept={-5.8 + waysIn * 4.6} />
			</feComponentTransfer>
			<feComposite in="SourceGraphic" in2="melt" operator="in" />
		</filter>
	</svg>
	<nav
		class="ways"
		class:shown={waysIn > 0 && !location.hash.includes('video')}
		class:melting={waysIn > 0 && waysIn < 1}
		inert={waysIn < 1}
		style:--x="{ways.x}px"
		style:--y="{ways.y}px"
		style:--k={ways.k}
		onpointerenter={() => (pointer.onWays = true)}
		onpointerleave={() => (pointer.onWays = false)}
	>
		{#each WAYS as way (way.to)}
			<button type="button" onclick={() => take(way.to)}>
				<span>{way.name}</span>
				<!-- a pen stroke under the word, drawn on hover -->
				<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
					<path d="M3 6.2 C 22 4.6, 41 7.4, 60 5.6 S 88 4.4, 97 5.4" />
				</svg>
			</button>
		{/each}
	</nav>
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

	/* the ways into the city: under the title, in its face, in the colour of the paper left on the pool of ink */
	.ways {
		--ink: rgb(236 222 192);
		position: absolute;
		left: var(--x);
		top: calc(var(--y) - 3px * var(--k));
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: calc(6px * var(--k));
		visibility: hidden;
	}
	.defs {
		position: absolute;
		width: 0;
		height: 0;
	}
	.ways.shown {
		visibility: visible;
	}
	.ways.melting {
		filter: url(#ways-melt);
	}
	.ways button {
		position: relative;
		padding: calc(3px * var(--k)) calc(8px * var(--k));
		border: 0;
		background: none;
		color: var(--ink);
		font:
			calc(15px * var(--k)) 'IM Fell English SC',
			Georgia,
			serif;
		letter-spacing: calc(3px * var(--k));
		cursor: pointer;
		transition: transform 0.35s cubic-bezier(0.2, 0.7, 0.3, 1);
	}
	.ways button:hover,
	.ways button:focus-visible {
		transform: scale(1.07);
	}
	.ways button:focus-visible {
		outline: none;
	}
	.ways svg {
		position: absolute;
		left: 8%;
		right: 8%;
		bottom: calc(-1px * var(--k));
		width: 84%;
		height: calc(6px * var(--k));
		overflow: visible;
	}
	.ways path {
		fill: none;
		stroke: var(--ink);
		stroke-width: calc(1.3px * var(--k));
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}
	/* the stroke is drawn from the left, as a pen would */
	.ways svg {
		clip-path: inset(-50% 100% -50% 0);
		transition: clip-path 0.45s cubic-bezier(0.3, 0.6, 0.2, 1);
	}
	.ways button:hover svg,
	.ways button:focus-visible svg {
		clip-path: inset(-50% 0 -50% 0);
	}
	@media (prefers-reduced-motion: reduce) and (hover: hover) {
		.ways button,
		.ways svg {
			transition: none;
		}
	}
</style>
