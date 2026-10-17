/**
 * The cover of the city as an SVG: a large dark hexagon at the centre with the name in a handwritten script,
 * and around it a honeycomb of smaller hexagons whose walls are rows of random letters, thinning out toward
 * the edges. Pure string output (no DOM), deterministic for a given seed.
 */

export interface CoverOptions {
	w: number;
	h: number;
	seed: number;
	/** circumradius of the central hexagon, as a fraction of the height */
	center: number;
	/** circumradius of the surrounding hexagons, as a fraction of the height */
	cell: number;
	/** letter size as a fraction of a cell's circumradius */
	letter: number;
	/** how quickly the letters thin out per ring away from the centre (0..1) */
	fade: number;
}

export const DEFAULT_COVER: CoverOptions = {
	w: 1600,
	h: 1000,
	seed: 1941,
	center: 0.3,
	cell: 0.075,
	letter: 0.2,
	fade: 0.11
};

/** The letters of the Library: the Spanish alphabet, a few accents, and the space and punctuation of Borges. */
const LETTERS = 'abcdefghijklmnñopqrstuvwxyzabcdeilmnorstuáéíóú';

const INK = '#2a1d14';
const PAPER = '#f1e9d8';

function rng(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 4294967296;
	};
}

const f = (n: number) => n.toFixed(1);

/** Corners of a flat-topped hexagon. */
function hexCorners(cx: number, cy: number, r: number): [number, number][] {
	return Array.from({ length: 6 }, (_, k) => {
		const a = (Math.PI / 3) * k;
		return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
	});
}

export function coverSVG(o: Partial<CoverOptions> = {}): string {
	const p = { ...DEFAULT_COVER, ...o };
	const { w, h } = p;
	const rand = rng(p.seed);
	const cx = w / 2,
		cy = h / 2;
	const R = p.center * h; // central hexagon
	const s = p.cell * h; // surrounding cells
	const size = s * p.letter;
	const step = size * 0.62; // letter spacing along a wall

	// the honeycomb of small cells (flat-topped), skipping those that would overlap the central hexagon
	const insideBig = (x: number, y: number, pad: number) => {
		// distance test against a flat-topped hexagon of circumradius R + pad
		const qx = Math.abs(x - cx),
			qy = Math.abs(y - cy),
			r = R + pad;
		return qy <= (r * Math.sqrt(3)) / 2 && qx * Math.sqrt(3) + qy <= r * Math.sqrt(3);
	};
	const walls: string[] = [];
	const seen = new Set<string>();
	const dx = s * 1.5,
		dy = s * Math.sqrt(3);
	const cols = Math.ceil(w / dx) + 2,
		rows = Math.ceil(h / dy) + 2;
	for (let i = -cols; i <= cols; i++)
		for (let j = -rows; j <= rows; j++) {
			const x = cx + i * dx,
				y = cy + j * dy + (i & 1 ? dy / 2 : 0);
			if (x < -s || x > w + s || y < -s || y > h + s) continue;
			if (insideBig(x, y, s * 0.9)) continue;
			// rings outward from the central hexagon's edge
			const ring = Math.max(0, Math.hypot(x - cx, y - cy) - R) / (s * 1.6);
			const keep = Math.max(0, 1 - ring * p.fade);
			if (keep <= 0.02) continue;
			const pts = hexCorners(x, y, s);
			for (let k = 0; k < 6; k++) {
				const a = pts[k],
					b = pts[(k + 1) % 6];
				const key = `${Math.round((a[0] + b[0]) / 4)},${Math.round((a[1] + b[1]) / 4)}`;
				if (seen.has(key)) continue;
				seen.add(key);
				const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
				let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
				let [ax, ay] = a,
					[bx, by] = b;
				if (ang > 90 || ang < -90) {
					[ax, ay, bx, by] = [bx, by, ax, ay];
					ang += ang > 0 ? -180 : 180;
				} // keep letters upright
				const n = Math.floor(len / step);
				let chars = '';
				for (let c = 0; c < n; c++) {
					const t = (c + 0.5) / n;
					const x0 = ax + (bx - ax) * t,
						y0 = ay + (by - ay) * t;
					if (insideBig(x0, y0, s * 0.15)) continue;
					if (rand() > keep * (0.55 + 0.45 * keep)) continue; // walls thin out away from the centre
					const ch = LETTERS[Math.floor(rand() * LETTERS.length)];
					const op = Math.min(1, 0.25 + 0.75 * keep) * (0.75 + 0.25 * rand());
					chars += `<text x="${f(x0)}" y="${f(y0)}" transform="rotate(${f(ang)} ${f(x0)} ${f(y0)})" fill-opacity="${op.toFixed(2)}">${ch}</text>`;
				}
				if (chars) walls.push(chars);
			}
		}

	// the central hexagon: dark ink, a fine inner rule in paper colour, the name
	const big = hexCorners(cx, cy, R)
		.map(([x, y]) => `${f(x)},${f(y)}`)
		.join(' ');
	const inner = hexCorners(cx, cy, R * 0.93)
		.map(([x, y]) => `${f(x)},${f(y)}`)
		.join(' ');
	const titleSize = R * 0.34;

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="La Ciudad de Babel">
<rect width="${w}" height="${h}" fill="${PAPER}"/>
<g font-family="'IM Fell English', Georgia, serif" font-style="italic" font-size="${f(size)}" fill="${INK}" text-anchor="middle" dominant-baseline="central">
${walls.join('\n')}
</g>
<polygon points="${big}" fill="${INK}"/>
<polygon points="${inner}" fill="none" stroke="${PAPER}" stroke-opacity="0.55" stroke-width="${f(R * 0.006)}"/>
<g font-family="'Mrs Saint Delafield', cursive" font-size="${f(titleSize)}" fill="${PAPER}" text-anchor="middle" dominant-baseline="central">
<text x="${f(cx - R * 0.06)}" y="${f(cy - titleSize * 0.42)}">La Ciudad</text>
<text x="${f(cx + R * 0.1)}" y="${f(cy + titleSize * 0.55)}">de Babel</text>
</g>
</svg>`;
}
