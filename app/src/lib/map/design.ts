/**
 * The map of the city as a drawing: hexagon galleries whose walls are lines of the Library's own text, a
 * spiral staircase of words at the centre, ring names and a title. Drawn in plain black on a transparent
 * canvas at the sheet's resolution; the ink reveal (src/lib/ink/reveal.ts) turns its coverage into wet ink.
 */

export interface MapDesign {
	/** the drawing, black on transparent, `w`×`h` px, row 0 at the top */
	canvas: HTMLCanvasElement;
	w: number;
	h: number;
	/** the centre of the map in px (row 0 at the top) */
	center: [number, number];
	/** hexagon circumradius in px */
	cell: number;
}

const FONTS = [
	'italic 24px "IM Fell English"',
	'24px "Mrs Saint Delafield"',
	'24px "Homemade Apple"'
];

/** Waits for the faces the drawing uses (canvas text does not wait on its own). */
export async function loadMapFonts() {
	if (!document.fonts) return;
	await Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => null)));
}

export function drawMap(w: number, h: number, text: string): MapDesign {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const c = canvas.getContext('2d')!;
	c.fillStyle = '#000';
	c.strokeStyle = '#000';
	c.textBaseline = 'middle';

	const s = Math.min(h / 7.4, w / 4.6); // hexagon circumradius: about three rings across the short side
	const cx = w / 2;
	const cy = h / 2 + s * 0.25;
	const hexXY = (q: number, r: number): [number, number] => [
		cx + s * Math.sqrt(3) * (q + r / 2),
		cy + s * 1.5 * r
	];
	const corner = (x: number, y: number, k: number, rad: number): [number, number] => {
		const a = (Math.PI / 180) * (60 * k - 30);
		return [x + rad * Math.cos(a), y + rad * Math.sin(a)];
	};
	const micro = Math.max(9, s * 0.1);
	const fontText = (px: number) => `italic ${px}px "IM Fell English", Georgia, serif`;

	let cursor = 0;
	const words = text.replace(/\s+/g, ' ').trim() || 'la biblioteca de babel';
	const next = (n: number) => {
		let out = '';
		while (out.length < n) {
			out += words.slice(cursor, cursor + n - out.length);
			cursor = (cursor + n) % words.length;
			if (out.length < n) out += ' · ';
		}
		return out;
	};

	// text along a segment, upright, `offset` px to one side of it
	const writeAlong = (
		a: [number, number],
		b: [number, number],
		txt: string,
		px: number,
		offset: number
	) => {
		const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
		const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
		const nx = -Math.sin(ang),
			ny = Math.cos(ang);
		const flip = Math.cos(ang) < -0.01;
		c.save();
		c.font = fontText(px);
		let used = 0;
		for (const ch of txt) {
			const cw = c.measureText(ch).width;
			if (used + cw > len) break;
			const t = (used + cw / 2) / len,
				tt = flip ? 1 - t : t;
			c.setTransform(
				1,
				0,
				0,
				1,
				a[0] + (b[0] - a[0]) * tt + nx * offset,
				a[1] + (b[1] - a[1]) * tt + ny * offset
			);
			c.rotate(flip ? ang + Math.PI : ang);
			c.fillText(ch, -cw / 2, 0);
			used += cw;
		}
		c.restore();
	};
	// a pen line that wavers a little
	const line = (a: [number, number], b: [number, number], width: number) => {
		c.save();
		c.lineWidth = width;
		c.lineCap = 'round';
		c.beginPath();
		c.moveTo(a[0], a[1]);
		const n = 6;
		for (let k = 1; k <= n; k++) {
			const t = k / n,
				j = k < n ? Math.sin(a[0] * 0.07 + k * 2.1 + a[1] * 0.05) * 0.8 : 0;
			c.lineTo(a[0] + (b[0] - a[0]) * t + j, a[1] + (b[1] - a[1]) * t - j);
		}
		c.stroke();
		c.restore();
	};
	const label = (txt: string, x: number, y: number, font: string, rot = 0) => {
		c.save();
		c.font = font;
		c.textAlign = 'center';
		c.translate(x, y);
		c.rotate(rot);
		c.fillText(txt, 0, 0);
		c.restore();
	};

	const title: [number, number, number, number] = [w / 2 - s * 2.4, 0, w / 2 + s * 2.4, s * 1.05];
	const inTitle = (x: number, y: number) =>
		x > title[0] && x < title[2] && y > title[1] && y < title[3];

	// the galleries
	const seen = new Set<string>();
	const span = Math.ceil(Math.max(w, h) / s) + 2;
	for (let q = -span; q <= span; q++)
		for (let r = -span; r <= span; r++) {
			const [x, y] = hexXY(q, r);
			if (x < -s || x > w + s || y < -s || y > h + s) continue;
			for (let k = 0; k < 6; k++) {
				const a = corner(x, y, k, s * 0.97),
					b = corner(x, y, k + 1, s * 0.97);
				const mx = (a[0] + b[0]) / 2,
					my = (a[1] + b[1]) / 2;
				const key = `${Math.round(mx / 4)},${Math.round(my / 4)}`;
				if (seen.has(key) || inTitle(mx, my) || inTitle(a[0], a[1]) || inTitle(b[0], b[1]))
					continue;
				seen.add(key);
				line(a, b, Math.max(1.2, s * 0.012));
				const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
				const inward = Math.sign((x - mx) * -Math.sin(ang) + (y - my) * Math.cos(ang)) || 1;
				const shrink = 0.13;
				writeAlong(
					[a[0] + (b[0] - a[0]) * shrink, a[1] + (b[1] - a[1]) * shrink],
					[b[0] + (a[0] - b[0]) * shrink, b[1] + (a[1] - b[1]) * shrink],
					next(160),
					micro,
					micro * 0.75 * inward
				);
			}
		}

	// the staircase at the centre: a spiral of words
	{
		const [x, y] = hexXY(0, 0);
		const turns = 3.1,
			r0 = s * 0.12,
			r1 = s * 0.62,
			total = turns * Math.PI * 2;
		c.save();
		c.font = fontText(micro * 0.95);
		const txt = next(900);
		let th = 0,
			i = 0;
		while (th < total && i < txt.length) {
			const rad = r0 + ((r1 - r0) * th) / total;
			const cw = c.measureText(txt[i]).width;
			c.setTransform(1, 0, 0, 1, x + Math.cos(th) * rad, y + Math.sin(th) * rad);
			c.rotate(th + Math.PI / 2);
			c.fillText(txt[i], -cw / 2, 0);
			th += (cw * 1.02) / rad;
			i++;
		}
		c.restore();
		label(
			'el centro',
			x,
			y + s * 0.8,
			`${Math.round(s * 0.17)}px "Homemade Apple", cursive`,
			-0.04
		);
	}
	{
		const [x, y] = hexXY(1, -1);
		label('los barrios', x, y, `${Math.round(s * 0.16)}px "Homemade Apple", cursive`, -0.05);
	}
	{
		const [x, y] = hexXY(-1, 2);
		label('las afueras', x, y, `${Math.round(s * 0.16)}px "Homemade Apple", cursive`, 0.04);
	}
	label(
		'La Ciudad de Babel',
		w / 2,
		s * 0.55,
		`${Math.round(s * 0.5)}px "Mrs Saint Delafield", cursive`,
		-0.03
	);

	return { canvas, w, h, center: [cx, cy], cell: s };
}
