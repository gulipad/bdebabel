/**
 * Inks the paper through a stencil: wherever the stencil canvas has coverage, the watercolour engine lays down
 * pigment and water with its bucket fill, so the marks sit in the paper grain, darken at their edges and dry in
 * place, as ink does. The fill runs outward from `center` at `speed`; a high speed reads as "already drawn",
 * a low one is a reveal.
 */
import type { Rect } from '#lib/watercolor/engine/gl.ts';
import type { InkSheet } from './sheet.ts';

export interface StencilInk {
	/** where the ink starts, in stencil px (row 0 at the top) */
	center: [number, number];
	/** how fast the front runs, in px per second */
	speed: number;
	/** pigment strength */
	strength: number;
	/** water laid with the pigment (0..1): more water, more bleeding */
	water: number;
	/** coverage (0..255) above which a pixel is inked */
	threshold: number;
}

const frame = () => new Promise<number>((r) => requestAnimationFrame(r));

/** Value noise in [0, 1), for an uneven front. */
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

export async function inkStencil(sheet: InkSheet, stencil: HTMLCanvasElement, o: StencilInk) {
	const e = sheet.engine;
	const [w, h] = e.docSize;
	if (stencil.width !== w || stencil.height !== h)
		throw new Error('the stencil does not match the sheet');
	const px = stencil.getContext('2d')!.getImageData(0, 0, w, h).data;
	// the fill's field: RG per texel, row 0 at the bottom of the sheet; R = when the ink arrives (px), -1 = no ink
	const field = new Float32Array(w * h * 2);
	const box: Rect = { x0: w, y0: h, x1: 0, y1: 0 };
	let max = 0;
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const t = ((h - 1 - y) * w + x) * 2;
			if (px[(y * w + x) * 4 + 3] <= o.threshold) {
				field[t] = -1;
				continue;
			}
			const d = Math.hypot(x - o.center[0], y - o.center[1]) + (noise2(x / 40, y / 40) - 0.5) * 30;
			field[t] = Math.max(0, d);
			max = Math.max(max, field[t]);
			const ty = h - 1 - y;
			box.x0 = Math.min(box.x0, x);
			box.x1 = Math.max(box.x1, x + 1);
			box.y0 = Math.min(box.y0, ty);
			box.y1 = Math.max(box.y1, ty + 1);
		}
	if (box.x1 <= box.x0 || !e.fillBegin(field, box, 'stencil')) return;
	let reached = 0,
		last = await frame();
	while (reached < max + 30) {
		const now = await frame();
		const to = Math.min(max + 30, reached + (o.speed * (now - last)) / 1000);
		if (!e.fillStep(reached, to, { strength: o.strength, water: o.water, soft: 0, paint: true }))
			break;
		reached = to;
		last = now;
	}
	e.fillEnd();
}
