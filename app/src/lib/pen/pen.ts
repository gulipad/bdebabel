/**
 * Pen and ink on paper, without a fluid simulation. What makes a pen line read as drawn (see the research notes):
 *  - the ink is transparent and multiplies onto the paper, and the same grain that shows in the paper modulates
 *    the ink's density, so the eye reads the line's texture as coming from the paper;
 *  - every stroke varies in width (it lands, swells, lifts), wobbles a little, overshoots or falls short;
 *  - ink pools where the nib lands and at corners, and stacks where strokes cross;
 *  - edges are soft and uneven: each stroke is laid as a few slightly different passes at partial opacity.
 * Strokes accumulate on ink layers (coverage in the alpha channel); `compose` multiplies them onto the paper.
 */

export type Pt = [number, number];

/** Deterministic random numbers. */
export function seeded(seed: number) {
	let s = seed >>> 0 || 1;
	return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function hash(i: number, j: number, seed: number) {
	const v = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
	return v - Math.floor(v);
}

/** Value noise in [0, 1). */
export function noise(x: number, y: number, seed: number) {
	const i = Math.floor(x),
		j = Math.floor(y),
		fx = x - i,
		fy = y - j;
	const ux = fx * fx * (3 - 2 * fx),
		uy = fy * fy * (3 - 2 * fy);
	const a = hash(i, j, seed) + (hash(i + 1, j, seed) - hash(i, j, seed)) * ux;
	const b = hash(i, j + 1, seed) + (hash(i + 1, j + 1, seed) - hash(i, j + 1, seed)) * ux;
	return a + (b - a) * uy;
}

/**
 * The same value noise, read from a table of its lattice values: for a field sampled at every pixel, each lattice
 * value is hashed once instead of four times per pixel. The table covers x in [0, cols - 1), y in [0, rows - 1).
 */
function lattice(cols: number, rows: number, seed: number) {
	const t = new Float64Array(cols * rows);
	for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) t[j * cols + i] = hash(i, j, seed);
	return { t, cols };
}
function tnoise({ t, cols }: { t: Float64Array; cols: number }, x: number, y: number) {
	const i = Math.floor(x),
		j = Math.floor(y),
		fx = x - i,
		fy = y - j;
	const ux = fx * fx * (3 - 2 * fx),
		uy = fy * fy * (3 - 2 * fy),
		n = j * cols + i;
	const a = t[n] + (t[n + 1] - t[n]) * ux;
	const b = t[n + cols] + (t[n + cols + 1] - t[n + cols]) * ux;
	return a + (b - a) * uy;
}

export interface Paper {
	w: number;
	h: number;
	/** the paper's tooth, 0..1 per pixel (row 0 at the top): high = a raised fibre */
	grain: Float32Array;
	/** the sheet's own colour per pixel, sRGB 0..255, RGB */
	rgb: Uint8ClampedArray;
}

/** A plain sheet: one warm tone, a faint even tooth, a little cloud in the formation, a slightly darker rim. */
export function makePaper(
	w: number,
	h: number,
	{ tint = [239, 224, 191] as [number, number, number], seed = 7, scale = 1 } = {}
): Paper {
	const grain = new Float32Array(w * h);
	const rgb = new Uint8ClampedArray(w * h * 3);
	const cx = w / 2,
		cy = h / 2,
		rmax = Math.hypot(cx, cy);
	// the cloud is broad: sampled every 8 px and interpolated
	const C = 8,
		cw = Math.ceil(w / C) + 2,
		clouds = new Float32Array(cw * (Math.ceil(h / C) + 2));
	for (let j = 0; j * C < h + C; j++)
		for (let i = 0; i < cw; i++)
			clouds[j * cw + i] =
				noise((i * C) / (260 * scale), (j * C) / (200 * scale), seed + 2) * 0.6 +
				noise((i * C) / (90 * scale), (j * C) / (70 * scale), seed + 3) * 0.4;
	const fine = lattice(Math.ceil(w / (1.6 * scale)) + 2, Math.ceil(h / (1.6 * scale)) + 2, seed),
		broad = lattice(Math.ceil(w / (4.5 * scale)) + 2, Math.ceil(h / (3.5 * scale)) + 2, seed + 1);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = y * w + x;
			// tooth: two fine octaves (scaled to device pixels so it looks the same on any screen)
			const g =
				0.6 * tnoise(fine, x / (1.6 * scale), y / (1.6 * scale)) +
				0.4 * tnoise(broad, x / (4.5 * scale), y / (3.5 * scale));
			grain[i] = g;
			const ci = Math.floor(x / C),
				cj = Math.floor(y / C),
				fx = x / C - ci,
				fy = y / C - cj,
				n = cj * cw + ci;
			const cloud =
				(clouds[n] * (1 - fx) + clouds[n + 1] * fx) * (1 - fy) +
				(clouds[n + cw] * (1 - fx) + clouds[n + cw + 1] * fx) * fy;
			const rim = Math.max(0, Math.hypot(x - cx, y - cy) / rmax - 0.62) / 0.38;
			const k = 1 + (g - 0.5) * 0.05 - (cloud - 0.5) * 0.05 - rim * rim * 0.08;
			rgb[i * 3] = tint[0] * k;
			rgb[i * 3 + 1] = tint[1] * k;
			rgb[i * 3 + 2] = tint[2] * k * 0.995;
		}
	return { w, h, grain, rgb };
}

export interface PenStyle {
	/** nominal line width in px */
	width: number;
	/** opacity of one pass (passes stack) */
	alpha: number;
	/** passes per stroke, each slightly perturbed: soft, uneven edges */
	passes: number;
	/** sideways tremor in px */
	wobble: number;
	/** how much ends overshoot or fall short, in px */
	ends: number;
	/** how much the width swells and thins along a stroke (0..1) */
	swell: number;
	/** extra ink where the nib lands (0..1) */
	pool: number;
}

export const NIB: PenStyle = {
	width: 1.6,
	alpha: 0.42,
	passes: 3,
	wobble: 0.45,
	ends: 1.2,
	swell: 0.35,
	pool: 0.5
};

/** One pen stroke along a polyline (px), into an ink layer: tapered, swelling, wobbling, pooled at the start. */
export function stroke(c: CanvasRenderingContext2D, pts: Pt[], s: PenStyle, rnd: () => number) {
	if (pts.length < 2) return;
	// resample the path every ~2 px so width and wobble can vary along it
	const path: Pt[] = [pts[0]];
	for (let k = 1; k < pts.length; k++) {
		const [ax, ay] = pts[k - 1],
			[bx, by] = pts[k];
		const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
		for (let i = 1; i <= n; i++) path.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
	}
	// overshoot or fall short at both ends, along the stroke's direction
	const extend = (p: Pt, q: Pt, d: number): Pt => {
		const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
		return [p[0] + ((p[0] - q[0]) / L) * d, p[1] + ((p[1] - q[1]) / L) * d];
	};
	path[0] = extend(path[0], path[1], (rnd() - 0.4) * s.ends);
	path[path.length - 1] = extend(
		path[path.length - 1],
		path[path.length - 2],
		(rnd() - 0.6) * s.ends
	);
	const n = path.length;
	for (let pass = 0; pass < s.passes; pass++) {
		const ph = rnd() * 10,
			ph2 = rnd() * 10,
			wj = 0.85 + rnd() * 0.3;
		const left: Pt[] = [],
			right: Pt[] = [];
		for (let i = 0; i < n; i++) {
			const t = i / (n - 1);
			const p = path[i],
				q = path[Math.min(n - 1, i + 1)],
				o = path[Math.max(0, i - 1)];
			let tx = q[0] - o[0],
				ty = q[1] - o[1];
			const L = Math.hypot(tx, ty) || 1;
			tx /= L;
			ty /= L;
			// the nib lands (a little heavy), runs, and lifts (thinner)
			const land = Math.exp(-t * 18),
				lift = Math.min(1, (1 - t) * 9);
			const swell =
				1 +
				s.swell * (0.5 * Math.sin(t * Math.PI * 1.7 + ph) + 0.5 * (noise(i * 0.08, ph, 3) - 0.5));
			const w = (s.width / 2) * wj * swell * (0.55 + 0.45 * lift) * (1 + 0.5 * land);
			const off =
				s.wobble *
				(Math.sin(t * Math.PI * 2.3 + ph2) * 0.6 + (noise(i * 0.15, ph2, 5) - 0.5) * 1.2);
			const nx = -ty,
				ny = tx;
			left.push([p[0] + nx * (off + w), p[1] + ny * (off + w)]);
			right.push([p[0] + nx * (off - w), p[1] + ny * (off - w)]);
		}
		c.globalAlpha = s.alpha;
		c.beginPath();
		c.moveTo(left[0][0], left[0][1]);
		for (const [x, y] of left) c.lineTo(x, y);
		for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]);
		c.closePath();
		c.fill();
	}
	// a little pool where the nib first touched the paper
	if (s.pool > 0) {
		c.globalAlpha = s.alpha * s.pool;
		c.beginPath();
		c.arc(path[0][0], path[0][1], s.width * (0.55 + rnd() * 0.25), 0, Math.PI * 2);
		c.fill();
	}
	c.globalAlpha = 1;
}

/** An ink layer: a transparent canvas the strokes accumulate on (coverage in alpha). */
export function inkLayer(w: number, h: number) {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const c = canvas.getContext('2d', { willReadFrequently: true })!;
	c.fillStyle = '#000';
	return { canvas, c };
}

/**
 * Multiplies ink layers onto the paper. Each layer has its ink colour (sRGB) and strength; the paper's tooth
 * modulates the ink (less on the raised fibres, a little more in the hollows), so line and sheet share a texture.
 */
export function compose(
	out: CanvasRenderingContext2D,
	paper: Paper,
	layers: Layer[],
	/** only these parts of the sheet, when given; the rest of `out` is left as it is */
	rects?: { x: number; y: number; w: number; h: number }[]
) {
	const { w, h } = paper;
	for (const r of rects ?? [{ x: 0, y: 0, w, h }]) {
		const x0 = Math.max(0, Math.floor(r.x)),
			y0 = Math.max(0, Math.floor(r.y)),
			x1 = Math.min(w, Math.ceil(r.x + r.w)),
			y1 = Math.min(h, Math.ceil(r.y + r.h));
		if (x1 > x0 && y1 > y0) composeRect(out, paper, layers, x0, y0, x1 - x0, y1 - y0);
	}
}

type Layer = {
	c: CanvasRenderingContext2D;
	ink: [number, number, number];
	strength: number;
	tooth?: number;
};

function composeRect(
	out: CanvasRenderingContext2D,
	paper: Paper,
	layers: Layer[],
	x0: number,
	y0: number,
	rw: number,
	rh: number
) {
	const { w, grain, rgb } = paper;
	const img = out.createImageData(rw, rh);
	const d = img.data;
	const cover = layers.map((l) => l.c.getImageData(x0, y0, rw, rh).data);
	// ink as a transmittance per channel: multiplying by it darkens the paper toward the ink's colour
	const trans = layers.map((l) => l.ink.map((v) => v / 255));
	for (let y = 0; y < rh; y++)
		for (let x = 0; x < rw; x++) {
			const i = (y0 + y) * w + x0 + x,
				o = y * rw + x;
			let r = rgb[i * 3] / 255,
				g = rgb[i * 3 + 1] / 255,
				b = rgb[i * 3 + 2] / 255;
			for (let k = 0; k < layers.length; k++) {
				const a0 = cover[k][o * 4 + 3] / 255;
				if (a0 <= 0) continue;
				const tooth = layers[k].tooth ?? 0.55;
				const a = Math.min(1, a0 * layers[k].strength * (1 - tooth * (grain[i] - 0.45)));
				const t = trans[k];
				r *= 1 - a * (1 - t[0]);
				g *= 1 - a * (1 - t[1]);
				b *= 1 - a * (1 - t[2]);
			}
			d[o * 4] = r * 255;
			d[o * 4 + 1] = g * 255;
			d[o * 4 + 2] = b * 255;
			d[o * 4 + 3] = 255;
		}
	out.putImageData(img, x0, y0);
}

/** Points along an SVG path string (px, after `transform`), for drawing arrows and flourishes with the pen. */
export function samplePath(d: string, map: (p: Pt) => Pt, step = 3): Pt[] {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', d);
	svg.appendChild(path);
	document.body.appendChild(svg);
	const L = path.getTotalLength();
	const out: Pt[] = [];
	for (let s = 0; s <= L; s += step) {
		const p = path.getPointAtLength(s);
		out.push(map([p.x, p.y]));
	}
	svg.remove();
	return out;
}

/**
 * The slightly imperfect line of the R. Chan cover (option E): crisp strokes, then every pixel shifted by a
 * fine noise field, as SVG's feTurbulence + feDisplacementMap do (there: baseFrequency .09, scale 1.6). The
 * edges get a small, steady irregularity, like a nib on a toothy sheet. `unit` is px per design unit.
 */
export function displace(
	c: CanvasRenderingContext2D,
	w: number,
	h: number,
	unit: number,
	{ frequency = 0.09, scale = 1.6, seed = 21 } = {},
	/** only this part of the layer, when given (ink just outside it is not drawn in) */
	rect?: { x: number; y: number; w: number; h: number }
) {
	const X0 = rect ? Math.max(0, Math.floor(rect.x)) : 0,
		Y0 = rect ? Math.max(0, Math.floor(rect.y)) : 0,
		rw = (rect ? Math.min(w, Math.ceil(rect.x + rect.w)) : w) - X0,
		rh = (rect ? Math.min(h, Math.ceil(rect.y + rect.h)) : h) - Y0;
	if (rw <= 0 || rh <= 0) return;
	const src = c.getImageData(X0, Y0, rw, rh);
	const out = c.createImageData(rw, rh);
	const s = src.data,
		d = out.data;
	const { field, gw } = offsets(w, h, unit, frequency, scale, seed);
	// only tiles with ink near them need the work (ink layers are mostly empty); a pixel moves less than a tile
	const tw = Math.ceil(rw / TILE),
		th = Math.ceil(rh / TILE),
		inked = new Uint8Array(tw * th);
	for (let y = 0; y < rh; y++)
		for (let x = 0, row = y * rw; x < rw; x++)
			if (s[(row + x) * 4 + 3]) {
				inked[Math.floor(y / TILE) * tw + Math.floor(x / TILE)] = 1;
				x = (Math.floor(x / TILE) + 1) * TILE - 1;
			}
	// only coverage matters on an ink layer: sample it bilinearly, so anti-aliased edges stay smooth
	const A = (x: number, y: number) =>
		x < 0 || y < 0 || x >= rw || y >= rh ? 0 : s[(y * rw + x) * 4 + 3];
	for (let ty = 0; ty < th; ty++)
		for (let tx = 0; tx < tw; tx++) {
			let near = 0;
			for (let j = Math.max(0, ty - 1); j <= Math.min(th - 1, ty + 1); j++)
				for (let i = Math.max(0, tx - 1); i <= Math.min(tw - 1, tx + 1); i++)
					near |= inked[j * tw + i];
			if (!near) continue;
			for (let y = ty * TILE; y < Math.min(rh, (ty + 1) * TILE); y++)
				for (let x = tx * TILE; x < Math.min(rw, (tx + 1) * TILE); x++) {
					// the offset, interpolated from the coarse field (which is laid over the whole layer)
					const gx = (X0 + x) / STEP,
						gy = (Y0 + y) / STEP,
						i = Math.floor(gx),
						j = Math.floor(gy),
						fx = gx - i,
						fy = gy - j,
						n = (j * gw + i) * 2,
						m = n + gw * 2;
					const ox =
						(field[n] * (1 - fx) + field[n + 2] * fx) * (1 - fy) +
						(field[m] * (1 - fx) + field[m + 2] * fx) * fy;
					const oy =
						(field[n + 1] * (1 - fx) + field[n + 3] * fx) * (1 - fy) +
						(field[m + 1] * (1 - fx) + field[m + 3] * fx) * fy;
					const sx = x + ox,
						sy = y + oy;
					const x0 = Math.floor(sx),
						y0 = Math.floor(sy),
						ax = sx - x0,
						ay = sy - y0;
					d[(y * rw + x) * 4 + 3] =
						(A(x0, y0) * (1 - ax) + A(x0 + 1, y0) * ax) * (1 - ay) +
						(A(x0, y0 + 1) * (1 - ax) + A(x0 + 1, y0 + 1) * ax) * ay;
				}
		}
	c.putImageData(out, X0, Y0);
}

const TILE = 32, // px per tile when skipping empty parts of a layer
	STEP = 4; // px between samples of the displacement field (it is smooth at that scale)
const fieldCache = new Map<string, { field: Float32Array; gw: number }>();

/**
 * The displacement offsets, in px, on a grid every STEP px, the same for every layer drawn at this size: two
 * octaves of noise per axis, centred on zero, an offset in [-amp/2, amp/2], as feDisplacementMap.
 */
function offsets(
	w: number,
	h: number,
	unit: number,
	frequency: number,
	scale: number,
	seed: number
) {
	const key = [w, h, unit, frequency, scale, seed].join();
	const hit = fieldCache.get(key);
	if (hit) return hit;
	const f = frequency / unit,
		amp = scale * unit,
		gw = Math.ceil(w / STEP) + 2,
		gh = Math.ceil(h / STEP) + 2,
		field = new Float32Array(gw * gh * 2);
	for (let j = 0; j < gh; j++)
		for (let i = 0; i < gw; i++) {
			const x = i * STEP,
				y = j * STEP,
				n = (j * gw + i) * 2;
			field[n] =
				(0.67 * noise(x * f, y * f, seed) + 0.33 * noise(x * f * 2, y * f * 2, seed + 1) - 0.5) *
				amp;
			field[n + 1] =
				(0.67 * noise(x * f, y * f, seed + 2) +
					0.33 * noise(x * f * 2, y * f * 2, seed + 3) -
					0.5) *
				amp;
		}
	fieldCache.clear(); // one size at a time
	const out = { field, gw };
	fieldCache.set(key, out);
	return out;
}

/**
 * A dried pool of ink in the shape of a hexagon, onto layer `c`. What makes it read as ink that pooled and dried
 * rather than a fill: its edge wanders; the ink is darkest in a rim along the edge, where it was carried as it
 * dried (the coffee-ring effect), with a faint tide line inside where it paused; its body is a little uneven;
 * just past the edge it has wicked into the raised fibres; and the paper's tooth (in `compose`) granulates it.
 * Where `reserve` has coverage the paper was kept from the ink (the title, left unstained): the ink stops
 * softly at those edges and pools a little darker against them. `drift` (lattice cells, 0..1 each) moves the
 * noise its edge wanders by (and, less, the unevenness of its body), for a few versions of the same pool that
 * differ a little.
 */
export function pool(
	c: CanvasRenderingContext2D,
	paper: Paper,
	{
		cx,
		cy,
		r,
		unit,
		reserve,
		drift = [0, 0]
	}: {
		cx: number;
		cy: number;
		r: number;
		unit: number;
		reserve?: CanvasRenderingContext2D;
		drift?: [number, number];
	}
) {
	const { w, h, grain } = paper;
	const pad = 14 * unit,
		x0 = Math.max(0, Math.floor(cx - r - pad)),
		y0 = Math.max(0, Math.floor(cy - r - pad)),
		bw = Math.min(w, Math.ceil(cx + r + pad)) - x0,
		bh = Math.min(h, Math.ceil(cy + r + pad)) - y0;
	if (bw <= 0 || bh <= 0) return;
	const blurred = (px: number) => {
		const t = document.createElement('canvas');
		t.width = bw;
		t.height = bh;
		const g = t.getContext('2d', { willReadFrequently: true })!;
		if (reserve) {
			g.filter = `blur(${px}px)`;
			g.drawImage(reserve.canvas, x0, y0, bw, bh, 0, 0, bw, bh);
		}
		return g.getImageData(0, 0, bw, bh).data;
	};
	const soft = blurred(0.7 * unit),
		halo = blurred(3 * unit);
	const img = c.getImageData(x0, y0, bw, bh),
		d = img.data;
	const apothem = (r * Math.sqrt(3)) / 2,
		u = unit;
	const table = (period: number, seed: number) =>
		lattice(Math.ceil(w / (period * u)) + 2, Math.ceil(h / (period * u)) + 2, seed);
	const n45 = table(45, 3),
		n11 = table(11, 5),
		n70 = table(70, 9);
	for (let by = 0; by < bh; by++)
		for (let bx = 0; bx < bw; bx++) {
			const x = x0 + bx,
				y = y0 + by,
				dx = Math.abs(x + 0.5 - cx),
				dy = Math.abs(y + 0.5 - cy);
			// distance to a flat-topped hexagon's edge (negative inside), wandering
			const edge =
				Math.max(dy - apothem, (dx * Math.sqrt(3)) / 2 + dy / 2 - apothem) +
				(tnoise(n45, x / (45 * u) + drift[0], y / (45 * u) + drift[1]) - 0.5) * 16 * u +
				(tnoise(n11, x / (11 * u) + drift[1] * 0.6, y / (11 * u) + drift[0] * 0.6) - 0.5) * 5 * u;
			const inside = Math.min(1, Math.max(0, 0.5 - edge / (1.2 * u))),
				depth = Math.max(0, -edge);
			let dens =
				inside *
				(0.6 +
					0.32 * Math.exp(-depth / (5 * u)) +
					0.14 * Math.exp(-(((depth - 24 * u) / (3 * u)) ** 2)) +
					(tnoise(n70, x / (70 * u) + drift[1] * 0.5, y / (70 * u) + drift[0] * 0.5) - 0.5) * 0.16);
			if (edge > 0) {
				const fibre = Math.min(1, Math.max(0, (grain[y * w + x] - 0.45) / 0.35));
				dens += 0.55 * Math.exp(-edge / (1.6 * u)) * fibre;
			}
			const i = (by * bw + bx) * 4,
				kept = soft[i + 3] / 255,
				against = Math.max(0, halo[i + 3] / 255 - kept);
			dens = dens * (1 - Math.min(1, kept * 1.15)) + inside * against * 0.35 * (1 - kept);
			d[i + 3] = Math.max(d[i + 3], Math.min(255, dens * 255));
		}
	c.putImageData(img, x0, y0);
}
