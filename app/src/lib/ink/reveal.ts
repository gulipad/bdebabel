/**
 * The Marauder's-Map reveal: a blot of wet ink blooms at the centre, is blotted up, and the map runs out of
 * where it was, along its own lines, in wet ink that bleeds a little and dries into the paper.
 *
 * It drives the vendored engine's bucket fill: a fill takes, for every texel, the distance at which ink
 * reaches it (-1 where no ink goes) and lays pigment and water down band by band, with the paper grain
 * roughening the front. Here that distance is measured along the drawing from the centre, so ink travels
 * the walls and letters as it would run along wet lines.
 */
import type { Rect } from '#lib/watercolor/engine/gl.ts';
import type { MapDesign } from '#lib/map/design.ts';
import type { InkSheet } from './sheet.ts';

export interface RevealOptions {
	/** blot radius, in hexagon cells */
	blot: number;
	/** how fast ink runs along the drawing, in sheet heights per second */
	speed: number;
	/** how wet the drawing's ink is laid (0..1): more water, more bleeding */
	water: number;
	/** pigment strength of the drawing's ink */
	strength: number;
}

export const DEFAULT_REVEAL: RevealOptions = { blot: 0.55, speed: 0.22, water: 0, strength: 1.5 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Value noise in [0, 1) on a lattice, for ragged edges and an uneven front. */
function noise2(x: number, y: number) {
	const h = (i: number, j: number) => {
		const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
		return v - Math.floor(v);
	};
	const i = Math.floor(x),
		j = Math.floor(y),
		fx = x - i,
		fy = y - j;
	const ux = fx * fx * (3 - 2 * fx),
		uy = fy * fy * (3 - 2 * fy);
	const a = h(i, j) + (h(i + 1, j) - h(i, j)) * ux;
	const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * ux;
	return a + (b - a) * uy;
}

/** Fields for the engine's fill, in its layout: RG per texel, row 0 at the bottom of the sheet. */
interface Fields {
	draw: Float32Array;
	drawBox: Rect;
	drawMax: number;
	blot: Float32Array;
	blotBox: Rect;
	blotRadius: number;
}

function buildFields(d: MapDesign, o: RevealOptions): Fields {
	const { w, h } = d;
	const px = d.canvas.getContext('2d')!.getImageData(0, 0, w, h).data;
	const n = w * h;
	const ink = new Uint8Array(n);
	for (let i = 0; i < n; i++) ink[i] = px[i * 4 + 3] > 90 ? 1 : 0;

	// ink can cross small gaps (between letters, from a wall to its line of text): a dilated conduit
	const R = 3;
	const tmp = new Uint8Array(n),
		conduit = new Uint8Array(n);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let v = 0;
			for (let k = -R; k <= R && !v; k++) {
				const xx = x + k;
				if (xx >= 0 && xx < w) v = ink[y * w + xx];
			}
			tmp[y * w + x] = v;
		}
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let v = 0;
			for (let k = -R; k <= R && !v; k++) {
				const yy = y + k;
				if (yy >= 0 && yy < h) v = tmp[yy * w + x];
			}
			conduit[y * w + x] = v;
		}

	// distance along the drawing from the centre: breadth-first over the conduit (8-neighbour)
	const dist = new Float32Array(n).fill(-1);
	const queue = new Int32Array(n);
	let head = 0,
		tail = 0;
	const [cx, cy] = d.center;
	const seedR = d.cell * 0.25;
	for (let y = Math.max(0, Math.floor(cy - seedR)); y < Math.min(h, cy + seedR); y++)
		for (let x = Math.max(0, Math.floor(cx - seedR)); x < Math.min(w, cx + seedR); x++) {
			const i = y * w + x;
			if (conduit[i] && Math.hypot(x - cx, y - cy) < seedR) {
				dist[i] = Math.hypot(x - cx, y - cy);
				queue[tail++] = i;
			}
		}
	while (head < tail) {
		const i = queue[head++],
			x = i % w,
			y = (i - x) / w,
			dv = dist[i];
		for (let dy = -1; dy <= 1; dy++)
			for (let dx = -1; dx <= 1; dx++) {
				if (!dx && !dy) continue;
				const xx = x + dx,
					yy = y + dy;
				if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
				const j = yy * w + xx;
				if (!conduit[j] || dist[j] >= 0) continue;
				dist[j] = dv + (dx && dy ? Math.SQRT2 : 1);
				queue[tail++] = j;
			}
	}

	// the drawing's field: ink pixels only; anything the conduit never reached arrives by the straight path
	const draw = new Float32Array(n * 2);
	let drawMax = 0;
	const drawBox: Rect = { x0: w, y0: h, x1: 0, y1: 0 };
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = y * w + x,
				t = ((h - 1 - y) * w + x) * 2;
			if (!ink[i]) {
				draw[t] = -1;
				continue;
			}
			let v = dist[i] >= 0 ? dist[i] : Math.hypot(x - cx, y - cy) * 1.4;
			v += (noise2(x / 40, y / 40) - 0.5) * 30; // an uneven front, as wet ink never runs evenly
			draw[t] = Math.max(0, v);
			draw[t + 1] = 0;
			drawMax = Math.max(drawMax, draw[t]);
			const ty = h - 1 - y;
			drawBox.x0 = Math.min(drawBox.x0, x);
			drawBox.x1 = Math.max(drawBox.x1, x + 1);
			drawBox.y0 = Math.min(drawBox.y0, ty);
			drawBox.y1 = Math.max(drawBox.y1, ty + 1);
		}

	// the blot: a ragged disc at the centre, flooding outward
	const blotRadius = d.cell * o.blot;
	const blot = new Float32Array(n * 2).fill(-1);
	const reach = blotRadius * 1.35;
	const blotBox: Rect = {
		x0: Math.max(0, Math.floor(cx - reach)),
		x1: Math.min(w, Math.ceil(cx + reach)),
		y0: Math.max(0, Math.floor(h - 1 - cy - reach)),
		y1: Math.min(h, Math.ceil(h - 1 - cy + reach))
	};
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const dx = x - cx,
				dy = y - cy,
				r = Math.hypot(dx, dy);
			if (r > reach) continue;
			const ang = Math.atan2(dy, dx);
			const edge =
				blotRadius * (0.82 + 0.4 * noise2(Math.cos(ang) * 2.2 + 5, Math.sin(ang) * 2.2 + 5));
			if (r > edge) continue;
			const t = ((h - 1 - y) * w + x) * 2;
			blot[t] = r;
			blot[t + 1] = 0;
		}

	return { draw, drawBox, drawMax, blot, blotBox, blotRadius };
}

/** Lays a fill down from distance 0 to `max`, at `pxPerSecond`. */
async function flood(
	sheet: InkSheet,
	field: Float32Array,
	box: Rect,
	max: number,
	pxPerSecond: number,
	o: { strength: number; water: number },
	label: string
) {
	const e = sheet.engine;
	if (!e.fillBegin(field, box, label)) return;
	let reached = 0,
		last = await frame();
	while (reached < max) {
		const now = await frame();
		const to = Math.min(max, reached + (pxPerSecond * (now - last)) / 1000);
		if (!e.fillStep(reached, to, { strength: o.strength, water: o.water, soft: 0, paint: true }))
			break;
		reached = to;
		last = now;
	}
	e.fillEnd();
}

/** Blots up the wet pool in a spiral, as a tissue would. */
function blotUp(sheet: InkSheet, center: [number, number], radius: number, h: number) {
	const e = sheet.engine;
	const turns = 2.5,
		pts: [number, number][] = [];
	for (let k = 0; k <= 320; k++) {
		// out to the rim and back in: every part of the pool is blotted twice
		const t = k <= 160 ? k / 160 : 2 - k / 160,
			a = (k / 160) * turns * Math.PI * 2,
			r = (radius * 1.05 * t) / h; // sheet heights
		pts.push([Math.cos(a) * r, Math.sin(a) * r]);
	}
	const anchor: [number, number] = [center[0] / e.docSize[0], 1 - center[1] / h];
	e.setParams({ size: 1 });
	return new Promise<void>((resolve) =>
		sheet.writer.write(
			[pts],
			anchor,
			{
				tool: 'lift',
				ref: radius / h,
				speed: 0.35,
				pressure: 1,
				taper: 0,
				wobble: 0,
				label: 'blot'
			},
			{ onDone: () => resolve() }
		)
	);
}

export async function revealMap(
	sheet: InkSheet,
	design: MapDesign,
	o: RevealOptions = DEFAULT_REVEAL
) {
	const e = sheet.engine;
	const [w, h] = e.docSize;
	if (w !== design.w || h !== design.h) throw new Error('the design does not match the sheet');
	const f = buildFields(design, o);

	// 1. the blot: a pool of very wet, thin ink that floods out from the centre; wet paper reads darker
	e.setParams({ load: 0.9, water: 1, bleed: 0.6, flow: 0.6, dry: 0.3, edge: 0.5 });
	await flood(
		sheet,
		f.blot,
		f.blotBox,
		f.blotRadius * 1.3,
		f.blotRadius * 1.6,
		{ strength: 1.5, water: 1 },
		'blot'
	);
	await sleep(250); // let it bloom

	// 2. blotted up while still wet, then the sheet dries: what is left is a faint stain
	await blotUp(sheet, design.center, f.blotRadius, h);
	e.fix();
	await sleep(1300);

	// 3. the map runs out of where the blot was, along its own lines: dry-ish ink that barely spreads and
	// sets quickly, so the micro-lettering of the walls stays legible
	e.setParams({ load: 0.9, water: 0.2, size: 0.5, bleed: 0.05, flow: 0.05, dry: 0.85, edge: 0.15 });
	await flood(
		sheet,
		f.draw,
		f.drawBox,
		f.drawMax + 30,
		o.speed * h,
		{ strength: o.strength, water: o.water },
		'map'
	);
}
