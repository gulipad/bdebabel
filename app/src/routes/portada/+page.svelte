<script lang="ts">
	/**
	 * Cover test page: the plan of the galleries drawn with a pen on paper (src/lib/pen). Walls, shelves and
	 * arrows are pen strokes; labels and notes are lettered into the same ink layers; both layers are multiplied
	 * onto the sheet so the paper's grain runs through the ink. The galleries' bands of lettering come and go: a
	 * band inks in letter by letter, each letter melting in a patch at a time, stays a while, and melts away again,
	 * giving its shelves back, while others ink in elsewhere. The pointer wears the plan's ink away near it, and
	 * the plan is drawn back after it. The sheet arrives worn away and the plan melts in in patches, with no
	 * lettering yet; as it is nearly in, the clearing's lines start to stream, and once it is in, the heart of the
	 * clearing melts in (a dark pool of ink with the title left unstained in it, or, with #limpio, the title
	 * alone); a little later the galleries' bands begin.
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
		pool,
		samplePath,
		seeded,
		stroke,
		type Pt
	} from '#lib/pen/pen.ts';

	let canvas: HTMLCanvasElement;

	/** the bands on the go (a gallery, and when it began to ink in), and the frame that carries them on */
	let bands: { g: number; start: number }[] = [],
		recent: number[] = [],
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
		CELL = 8; // sheet px per cell of the wear field

	/** the pointer, in css px */
	const pointer = { x: 0, y: 0, in: false };
	/** asks for a frame when nothing else is drawing them (a still cover) */
	let kick = () => {};
	/** whether the sheet has made its entrance (it does once, not on every resize) */
	let entered = false;
	/** when the clearing's lines start streaming in, when its heart melts in, and when the bands may begin */
	let clearingAt = -Infinity,
		heartAt = -Infinity,
		bandsAt = -Infinity,
		melting = 0; // how much of the entrance's deepest wear is still to be drawn back
	const LEAD_MS = 500, // ms before the plan has fully melted in that the clearing's lines start
		CLEARING_MS = 45, // ms between letters of the clearing's lines, written as one loop, the outer line first
		HEART_MS = 3500, // ms for the heart of the clearing to melt in, starting once the plan is in
		BANDS_AFTER = 2500; // ms after the heart has melted in before the first band

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
		const scene = planoScene();
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
		const plain = location.hash.includes('limpio');
		// the clearing's lines as ink alone, to multiply on top of everything once they stream in
		const innerInk = sheet(w, h);
		compose(innerInk, white, [{ c: inner.c, ink: SEPIA, strength: 1.15 }]);
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
		if (!still && !entered) {
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
					wear[j * gw + i] = 1.05 + 0.9 * (top + (bot - top) * sy);
					deepest = Math.max(deepest, wear[j * gw + i]);
				}
		}
		// the lettering waits for the plan to melt in: wearAway() says when it has, keeping pace with the wear itself
		// (frames can run slower than the clock); a resize mid-entrance, which starts the wear afresh, ends it
		const lettersFrom = (t: number) => {
			melting = 0;
			clearingAt = Math.min(clearingAt, t - LEAD_MS);
			heartAt = t;
			bandsAt = heartAt + HEART_MS + BANDS_AFTER;
		};
		if (still) [clearingAt, heartAt, bandsAt] = [-Infinity, -Infinity, -Infinity];
		else if (!entered && deepest > 0) {
			melting = deepest;
			[clearingAt, heartAt, bandsAt] = [Infinity, Infinity, Infinity];
		} else if (!entered || melting > 0) lettersFrom(performance.now());
		entered = true;
		const lift = new ImageData(hw, hh),
			liftC = sheet(hw, hh);
		let last = performance.now();
		compose(after, paper, [...layers, { c: letters.c, ink: SEPIA, strength: 1.15 }]);

		// one drop per letter, at the middle of its body, due in turn along its line (ms after the line starts)
		type Drop = { x: number; y: number; r: number; due: number; /** ms to melt in */ dur?: number };
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
						due: lag + i * step + drnd() * 40
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
			field?: { idx: Int16Array; wgt: Float32Array; ord: Float32Array };
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
			const f = {
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
			return (st.field = f);
		};
		/** The strand's mask at `e` ms after it started, with `going` (1..0) of it left as it melts away. */
		const maskOf = (st: Strand, e: number, going: number) => {
			if (!st.mask) {
				const c = sheet(st.sw, st.sh);
				st.mask = { c, img: c.createImageData(st.sw, st.sh), dry: false };
			}
			const m = st.mask;
			// once written and until it starts to go, a strand's mask stands still
			const settled = e >= st.written && going === 1;
			if (m.dry && settled) return m.c;
			const f = fieldOf(st),
				here = st.drops.map((d) =>
					Math.min(going, Math.max(0, Math.min(1, (e - d.due) / (d.dur ?? BLOOM_MS))))
				),
				a = m.img.data;
			for (let p = 0; p < st.sw * st.sh; p++) {
				const i = f.idx[p];
				if (i < 0) {
					a[p * 4 + 3] = 0;
					continue;
				}
				const t = Math.min(1, Math.max(0, (here[i] * f.wgt[p] * 1.25 - f.ord[p] + 0.08) / 0.16));
				a[p * 4 + 3] = t * t * (3 - 2 * t) * 255;
			}
			m.c.putImageData(m.img, 0, 0);
			m.dry = settled;
			return m.c;
		};
		const strands = scene.lettering.map((g) => strandOf(dropsOf(g.ring, LETTER_MS)));
		const written = strands.map((st) => st.written);
		const life = (g: number) => written[g] + HOLD_MS + FADE_MS;
		const clearing = strandOf(
			scene.plan
				.filter((m) => m.kind === 'ring')
				.reduce<Drop[]>((ds, m) => {
					const lag = ds.length ? ds[ds.length - 1].due + CLEARING_MS : 0;
					return [...ds, ...dropsOf(m, CLEARING_MS, lag)];
				}, [])
		);

		// the heart of the clearing: the title, either left unstained in a pool of ink or written in ink alone
		const [hx, hy] = at(scene.centre.c),
			hr = scene.centre.r * k;
		const titled = inkLayer(w, h);
		draw(titled.c, scene.centre.title);
		const heartInk = sheet(w, h);
		if (plain) {
			displace(titled.c, w, h, k);
			compose(heartInk, white, [{ c: titled.c, ink: IRON_GALL, strength: 1.2, tooth: 0.4 }]);
		} else {
			const pond = inkLayer(w, h);
			pool(pond.c, paper, { cx: hx, cy: hy, r: hr, unit: k, reserve: titled.c });
			compose(heartInk, white, [{ c: pond.c, ink: IRON_GALL, strength: 1, tooth: 0.5 }]);
		}
		// it melts in from the middle out, as one drop reaching the whole of it
		const heart = strandOf([{ x: hx, y: hy, r: hr * 1.6, due: 0, dur: HEART_MS }]);

		// a strand's ink, through its mask, multiplied onto the sheet on top of everything (nothing wears it away)
		const inkThrough = (st: Strand, e: number, ink: CanvasRenderingContext2D) => {
			if (e <= 0 || !st.drops.length) return;
			const [W, H] = [st.sw * 2, st.sh * 2];
			const spot = (st.spot ??= sheet(W, H));
			spot.globalCompositeOperation = 'copy';
			spot.drawImage(maskOf(st, e, 1).canvas, 0, 0, W, H);
			spot.globalCompositeOperation = 'source-in';
			spot.drawImage(ink.canvas, st.x0, st.y0, W, H, 0, 0, W, H);
			out.globalCompositeOperation = 'multiply';
			out.drawImage(spot.canvas, st.x0, st.y0);
			out.globalCompositeOperation = 'source-over';
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
		const frame = (now: number) => {
			if (still) bands = scene.opening.map((g) => ({ g, start: now - written[g] }));
			else {
				// bands that have faded make way for new ones, in galleries away from the others and not just used
				bands = bands.filter((b) => now - b.start < life(b.g));
				// (a band waiting to start counts as being written)
				const writing = () => bands.filter((b) => now - b.start < written[b.g]).length;
				while (bands.length < BANDS && writing() < WRITING && bandsAt < Infinity) {
					const free = scene.lettering
						.map((_, i) => i)
						.filter((i) => !recent.includes(i) && far(i));
					if (!free.length) break;
					const g = free[Math.floor(Math.random() * free.length)];
					const last = Math.max(-Infinity, ...bands.map((b) => b.start));
					bands.push({
						g,
						start: Math.max(now + 300, bandsAt, last + GAP_MS * (0.7 + Math.random() * 0.6))
					});
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
			inkThrough(heart, now - heartAt, heartInk);
			inkThrough(clearing, now - clearingAt, innerInk);
			if (!still || worn) raf = requestAnimationFrame(frame);
		};
		// the pointer wears the field down near it, steeply less with distance, and the pen draws it back everywhere
		let worn = false;
		const wearAway = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			if (melting > 0) {
				melting -= dt * REDRAW;
				// the structure can be told a little before it is all in: the clearing's lines start then
				if (clearingAt === Infinity && melting <= (LEAD_MS / 1000) * REDRAW) clearingAt = now;
				if (melting <= 0) lettersFrom(now);
			}
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
			for (let y = Y0; y < Y1; y++)
				for (let x = X0; x < X1; x++) {
					const gx = x / step,
						gy = y / step,
						i = Math.floor(gx),
						j = Math.floor(gy),
						fx = gx - i,
						fy = gy - j,
						n = j * gw + i;
					const v =
						(wear[n] * (1 - fx) + wear[n + 1] * fx) * (1 - fy) +
						(wear[n + gw] * (1 - fx) + wear[n + gw + 1] * fx) * fy;
					const t = Math.min(1, Math.max(0, (v * 1.25 - order[y * hw + x] + 0.08) / 0.16));
					d[(y * hw + x) * 4 + 3] = t * t * (3 - 2 * t) * 255;
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
			mask.drawImage(bare.canvas, 0, 0);
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
	}

	onMount(() => {
		let timer = 0;
		const redraw = () => {
			clearTimeout(timer);
			timer = window.setTimeout(render, 200);
		};
		fonts = Promise.all(PLANO_FONTS.map((f) => document.fonts.load(f).catch(() => null)));
		// with reduced motion the lettering is simply there, and stays
		still = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
