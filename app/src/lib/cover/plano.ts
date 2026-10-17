/**
 * The cover: the plan of the galleries around an empty clearing, with a few labels and the librarian's notes.
 * Described once as marks (lines, circles, pen strokes, text) in two layers: the plan, drawn in sepia, and the
 * notes, in the librarian's darker ink. The marks are drawn onto a stencil at the sheet's resolution, and the
 * watercolour engine lays real ink into its paper through that stencil (src/lib/ink/stencil.ts).
 */

/** The design is laid out on a 1200 × 780 board, centred on the sheet and scaled to cover it. */
export const VIEW = { w: 1200, h: 780 } as const;

export interface PlanoOptions {
	seed: number;
	/** hexagon circumradius, in board units */
	cell: number;
	/** gap between a wall's two lines */
	gap: number;
	/** share of walls with a doorway */
	doors: number;
	/** share of galleries with a ventilation shaft */
	shafts: number;
	/** radius of the empty clearing at the centre (0: none) */
	clearing: number;
}

export const DEFAULT_PLANO: PlanoOptions = {
	seed: 1941,
	cell: 66,
	gap: 5.5,
	doors: 0.42,
	shafts: 0.3,
	clearing: 268
};

type Pt = [number, number];

export type Mark =
	| { kind: 'line'; a: Pt; b: Pt; w: number; alpha?: number }
	| { kind: 'circle'; c: Pt; r: number; w: number; alpha?: number }
	| { kind: 'path'; d: string; w: number; fill?: boolean; alpha?: number }
	| {
			kind: 'text';
			t: string;
			at: Pt;
			size: number;
			font: string;
			rot?: number;
			spacing?: number;
			align?: CanvasTextAlign;
			alpha?: number;
	  }
	/** a phrase lettered along a closed line of walls (clockwise, from its first point), repeated to close the loop */
	| {
			kind: 'ring';
			t: string;
			pts: Pt[];
			size: number;
			font: string;
			alpha?: number;
	  };

export interface PlanoScene {
	/** the plan: walls, shelves, shafts, labels and the title line */
	plan: Mark[];
	/** the librarian's notes, arrows and blot */
	notes: Mark[];
	/** the galleries that can carry a band of lettering, kept apart so the bands can come and go */
	lettering: Lettered[];
	/** a spread-out set of those galleries (indices), for a cover that stands still */
	opening: number[];
	/** the heart of the clearing: a hexagon (centre, circumradius) inside the lines, and the title set in it */
	centre: { c: Pt; r: number; title: Mark[] };
}

/** A gallery that can be lettered: its band, and the shelves the band replaces. */
export interface Lettered {
	c: Pt;
	ring: Extract<Mark, { kind: 'ring' }>;
	shelves: Mark[];
}

const FELL = "italic {s}px 'IM Fell English', Georgia, serif";
/**
 * The title face the user liked (2026-10-18), kept for later: IM Fell English SC, small caps, about 15 board
 * units, letter-spaced 4 units, in the plan's ink, centred (it set "PLANO DE LAS GALERÍAS · BABEL-1").
 */
export const TITLE_FONT = {
	font: "{s}px 'IM Fell English SC', Georgia, serif",
	size: 15,
	spacing: 4
} as const;

/** Faces the scene draws with; canvas text does not wait for fonts on its own. */
export const PLANO_FONTS = ['italic 14px "IM Fell English"', '14px "IM Fell English SC"'];

function seeded(seed: number) {
	let s = seed;
	return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** What the galleries are called, for the bands of lettering: the parts of the Library. */
const NAMED = ['galería de los volúmenes', 'pozo de ventilación', 'escalera de caracol'];
const WORDS = [
	'vestíbulo',
	'gabinete de dormir',
	'gabinete de las necesidades',
	'zaguán',
	'pasillo',
	'rellano',
	'anaqueles',
	'sala de lectura',
	'archivo',
	'galería hexagonal',
	'barandas',
	'el espejo del zaguán'
];

/** From a page of babel-1 (src/lib/map/sample-text.ts): one line per loop, the outermost first. */
const CLEARING_TEXT = [
	'Los macrocéfalos están de acuerdo en que la vida es una serie de movimientos y movimientos que se han transmitido recíprocamente, de suerte que sus estados de ánimo, cuando son divergentes, en su mayor parte, son necesariamente independientes.',
	'Tal es la regla general, y según ellos, para que la mente se sienta capaz de explicar en sus sentimientos, hay que fingir, o, lo que es lo mismo, tomar en cuenta la magnitud, longitud y magnitud de la causa de que sea un objeto.'
];

const hexPts = (cx: number, cy: number, r: number): Pt[] =>
	Array.from({ length: 6 }, (_, k) => {
		const a = (Math.PI / 3) * k;
		return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
	});

const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/**
 * The edge of the clearing: the outer walls of the galleries that face it, chained into one closed line, pushed
 * `inset` into the clearing and ordered clockwise from its top-left, so letters along it lean on the walls.
 */
function clearingShore(
	cells: Pt[],
	s: number,
	cx: number,
	cy: number,
	clearing: number,
	inset: number
) {
	const key = ([x, y]: Pt) => `${Math.round(x)},${Math.round(y)}`;
	const next = new Map<string, [Pt, Pt]>(); // a facing wall by its first corner
	for (const [x, y] of cells) {
		const outer = hexPts(x, y, s);
		for (let k = 0; k < 6; k++) {
			const a = (Math.PI / 3) * (k + 0.5),
				n: Pt = [x + s * Math.sqrt(3) * Math.cos(a), y + s * Math.sqrt(3) * Math.sin(a)];
			if (Math.hypot(n[0] - cx, n[1] - cy) >= clearing) continue;
			// walk the clearing's side clockwise around the centre: the cell's own corners in reverse
			next.set(key(outer[(k + 1) % 6]), [outer[(k + 1) % 6], outer[k]]);
		}
	}
	if (next.size === 0) return [];
	const start = [...next.values()].reduce((m, w) =>
		w[0][0] + w[0][1] < m[0][0] + m[0][1] ? w : m
	);
	const walls: [Pt, Pt][] = [];
	for (
		let w: [Pt, Pt] | undefined = start;
		w && walls.length < next.size;
		w = next.get(key(w[1]))
	) {
		walls.push(w);
		if (key(w[1]) === key(start[0])) break;
	}
	// each wall moved into the clearing along its normal, the corners where neighbouring walls meet
	const moved = walls.map(([a, b]) => {
		const l = Math.hypot(b[0] - a[0], b[1] - a[1]),
			nx = -(b[1] - a[1]) / l,
			ny = (b[0] - a[0]) / l;
		return [
			[a[0] + nx * inset, a[1] + ny * inset],
			[b[0] + nx * inset, b[1] + ny * inset]
		] as [Pt, Pt];
	});
	return moved.map(([a, b], i) => {
		const [c, d] = moved[(i + moved.length - 1) % moved.length];
		const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
		if (Math.abs(den) < 1e-9) return a;
		const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
		return lerp(a, b, t);
	});
}

export function planoScene(o: Partial<PlanoOptions> = {}): PlanoScene {
	const p = { ...DEFAULT_PLANO, ...o };
	const rnd = seeded(p.seed);
	const plan: Mark[] = [];
	const notes: Mark[] = [];
	const lettering: Lettered[] = [];
	const s = p.cell,
		gap = p.gap,
		cx = VIEW.w / 2,
		cy = VIEW.h / 2 + 10;
	const dx = s * 1.5,
		dy = s * Math.sqrt(3);

	// the galleries, leaving the clearing empty
	const cells: Pt[] = [];
	for (let i = -9; i <= 9; i++)
		for (let j = -7; j <= 7; j++) {
			const x = cx + i * dx,
				y = cy + j * dy + (i & 1 ? dy / 2 : 0);
			if (x < 30 || x > VIEW.w - 30 || y < 30 || y > VIEW.h - 20) continue;
			if (Math.hypot(x - cx, y - cy) < p.clearing) continue;
			cells.push([x, y]);
		}
	const seen = new Set<string>();
	const wall = (a: Pt, b: Pt, t0: number, t1: number) =>
		plan.push({ kind: 'line', a: lerp(a, b, t0), b: lerp(a, b, t1), w: 1.5 });
	for (const [x, y] of cells) {
		const outer = hexPts(x, y, s),
			inner = hexPts(x, y, s - gap);
		for (let k = 0; k < 6; k++) {
			const a = outer[k],
				b = outer[(k + 1) % 6],
				a2 = inner[k],
				b2 = inner[(k + 1) % 6];
			const key = `${Math.round((a[0] + b[0]) / 6)},${Math.round((a[1] + b[1]) / 6)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			if (rnd() < p.doors) {
				wall(a, b, 0, 0.36);
				wall(a, b, 0.64, 1);
				wall(a2, b2, 0, 0.34);
				wall(a2, b2, 0.66, 1);
			} else {
				wall(a, b, 0, 1);
				wall(a2, b2, 0, 1);
			}
		}
	}
	// the galleries that can carry a band of lettering: away from the board's edges and the clearing's shore
	const lrnd = seeded(p.seed + 7);
	const order = cells
		.map((c) => ({ c, r: lrnd() }))
		.filter(({ c: [x, y] }) => x > 110 && x < VIEW.w - 110 && y > 90 && y < VIEW.h - 90)
		.filter(({ c: [x, y] }) =>
			Array.from({ length: 6 }, (_, k) => (Math.PI / 3) * (k + 0.5)).every(
				(a) => Math.hypot(x + dy * Math.cos(a) - cx, y + dy * Math.sin(a) - cy) >= p.clearing
			)
		)
		.sort((a, b) => a.r - b.r)
		.map(({ c }) => c);
	const words = [...WORDS].sort(() => lrnd() - 0.5);
	const phrases = [...NAMED, ...words];
	const size = 11,
		r = ((s - gap) * Math.sqrt(3)) / 2 - 2 - size * 0.72; // the baseline's apothem, letters leaning on the wall
	order.forEach(([x, y], i) => {
		const pts = hexPts(x, y, (r * 2) / Math.sqrt(3));
		lettering.push({
			c: [x, y],
			ring: {
				kind: 'ring',
				t: phrases[i % phrases.length],
				pts: [...pts.slice(4), ...pts.slice(0, 4)], // from the top-left corner
				size,
				font: FELL,
				alpha: 0.9
			},
			shelves: []
		});
	});
	const opening: number[] = [];
	lettering.forEach((g, i) => {
		if (opening.length >= Math.min(phrases.length, Math.round(cells.length / 6))) return;
		if (
			opening.some(
				(j) => Math.hypot(lettering[j].c[0] - g.c[0], lettering[j].c[1] - g.c[1]) < dy * 1.6
			)
		)
			return;
		opening.push(i);
	});

	// a sentence from a page of babel-1 lining the clearing, along the walls that face it
	CLEARING_TEXT.forEach((t, i) => {
		const shore = clearingShore(cells, s, cx, cy, p.clearing, 3 + 15 * 0.72 + i * 17);
		if (shore.length > 2)
			plan.push({ kind: 'ring', t, pts: shore, size: 15, font: FELL, alpha: 0.9 });
	});

	// shelves along two walls of each gallery (a lettered gallery keeps its own), and some ventilation shafts
	for (const [x, y] of cells) {
		const inn = hexPts(x, y, s - gap - 6);
		const shelves = lettering.find((g) => g.c[0] === x && g.c[1] === y)?.shelves ?? plan;
		for (const k of [1, 4]) {
			const a = inn[k],
				b = inn[(k + 1) % 6];
			for (let t = 0.2; t <= 0.8; t += 0.085) {
				const q = lerp(a, b, t);
				shelves.push({
					kind: 'line',
					a: q,
					b: [q[0] + (x - q[0]) * 0.09, q[1] + (y - q[1]) * 0.09],
					w: 0.8,
					alpha: 0.75
				});
			}
		}
		if (rnd() < p.shafts) plan.push({ kind: 'circle', c: [x, y], r: 8, w: 1, alpha: 0.75 });
	}

	// the title, in the face kept for it, in the middle of the clearing
	const title: Mark[] = [
		['LA BIBLIOTECA', cy - 4],
		['DE BABEL', cy + 34]
	].map(([t, y]) => ({
		kind: 'text',
		t: t as string,
		at: [cx, y as number],
		size: 27,
		font: TITLE_FONT.font,
		spacing: TITLE_FONT.spacing + 1
	}));

	return { plan, notes, lettering, opening, centre: { c: [cx, cy], r: 165, title } };
}

/**
 * A ring's letters as text marks: along its line from the first point, each letter turned to its wall with its top
 * against it, whole words only, the slack spread between the letters so the loop closes evenly.
 */
export function ringLetters(
	c: CanvasRenderingContext2D,
	m: Extract<Mark, { kind: 'ring' }>
): Mark[] {
	c.save();
	c.font = m.font.replace('{s}', String(m.size));
	const width = (t: string) => c.measureText(t).width;
	const segs = m.pts.map((a, i) => {
		const b = m.pts[(i + 1) % m.pts.length];
		return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
	});
	const per = segs.reduce((t, g) => t + g.len, 0);
	const unit = m.t + ' · ';
	let text = '';
	while (width(text + unit) <= per) text += unit;
	for (const word of unit.split(' ')) {
		if (width(text + word + ' ') > per) break;
		text += word + ' ';
	}
	const chars = [...text];
	const ws = chars.map(width);
	c.restore();
	const gapw = (per - ws.reduce((a, b) => a + b, 0)) / chars.length;
	const out: Mark[] = [];
	let d = 0,
		e = 0,
		at0 = 0; // the wall the letter is on, and where along the line that wall starts
	chars.forEach((t, i) => {
		const mid = d + ws[i] / 2;
		d += ws[i] + gapw;
		while (e < segs.length - 1 && mid > at0 + segs[e].len) at0 += segs[e++].len;
		if (t === ' ') return;
		const { a, b, len } = segs[e];
		out.push({
			kind: 'text',
			t,
			at: lerp(a, b, (mid - at0) / len),
			rot: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
			size: m.size,
			font: m.font,
			alpha: m.alpha
		});
	});
	return out;
}

/** Where the board sits on a w × h sheet: centred, scaled to cover it (like `background-size: cover`). */
export function boardTransform(w: number, h: number) {
	const k = Math.max(w / VIEW.w, h / VIEW.h);
	return {
		k,
		ox: (w - VIEW.w * k) / 2,
		oy: (h - VIEW.h * k) / 2,
		center: [w / 2, h / 2 + 10 * k] as Pt
	};
}

/** Draws marks in black onto a 2D context at the board transform (the stencil the engine inks through). */
export function drawMarks(c: CanvasRenderingContext2D, marks: Mark[], w: number, h: number) {
	const { k, ox, oy } = boardTransform(w, h);
	c.save();
	c.setTransform(k, 0, 0, k, ox, oy);
	c.fillStyle = '#000';
	c.strokeStyle = '#000';
	c.lineCap = 'round';
	c.lineJoin = 'round';
	for (const m of marks.flatMap((m) => (m.kind === 'ring' ? ringLetters(c, m) : [m]))) {
		c.globalAlpha = m.alpha ?? 1;
		switch (m.kind) {
			case 'line':
				c.lineWidth = m.w;
				c.beginPath();
				c.moveTo(m.a[0], m.a[1]);
				c.lineTo(m.b[0], m.b[1]);
				c.stroke();
				break;
			case 'circle':
				c.beginPath();
				c.arc(m.c[0], m.c[1], m.r, 0, Math.PI * 2);
				if (m.w > 0) {
					c.lineWidth = m.w;
					c.stroke();
				} else c.fill();
				break;
			case 'path': {
				const path = new Path2D(m.d);
				if (m.fill) c.fill(path);
				else {
					c.lineWidth = m.w;
					c.stroke(path);
				}
				break;
			}
			case 'text': {
				c.save();
				c.translate(m.at[0], m.at[1]);
				if (m.rot) c.rotate((m.rot * Math.PI) / 180);
				c.font = m.font.replace('{s}', String(m.size));
				c.textAlign = m.align ?? 'center';
				c.textBaseline = 'alphabetic';
				if (m.spacing) c.letterSpacing = `${m.spacing}px`;
				c.fillText(m.t, 0, 0);
				c.restore();
				break;
			}
		}
	}
	c.restore();
}
