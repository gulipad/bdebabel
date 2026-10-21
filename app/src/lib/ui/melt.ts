/**
 * Melting, the city's one transition, for HTML: an element comes and goes the way the ink does on the cover,
 * in blotchy patches that grow out of a noise field. `melt` is an action that melts an element in when it mounts
 * (or comes into view); `meltAway` melts one out and resolves when it's gone; `meltIn` melts one back.
 *
 * Like the cover, it draws on a canvas and leaves the element alone. One canvas over the window holds a copy of
 * the paper on screen (ui/paper.ts) wherever an element is still hidden, in patches, and each frame takes more
 * of it away (or puts more back). Masking or filtering the element itself made Safari on an iPhone draw it, and
 * every inked drawing in it, again on every frame of a melt: it couldn't keep up, and the melts flashed.
 */
import { handheld } from './device.ts';
import { paperOnScreen } from './paper.ts';

/**
 * reduced motion keeps things still on a desktop; on a phone or a tablet the melts run anyway, as the cover's
 * leaving always did: they are ink dissolving in place, nothing moves
 */
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches && !handheld();

const /** noise px per css px: the patches are tens of px wide, so a quarter is plenty (it is smoothed up) */
	SCALE = 0.25,
	/** how far the paper reaches beyond the element's box, for what overflows it a little */
	PAD = 24,
	/** how soft a patch's edge is, in the noise's 0..1 */
	EDGE = 0.07;

/** Blotchy noise over `w` × `h` css px, at SCALE, spread over 0..1. */
interface Field {
	w: number;
	h: number;
	iw: number;
	ih: number;
	v: Float32Array;
}

/**
 * Fractal value noise (four octaves, like feTurbulence's fractalNoise). Fields of a size are shared, in three
 * variants, so that neighbours don't melt alike.
 */
const fields = new Map<string, Field>();
function field(w: number, h: number, grain: number, seed: number): Field {
	const key = `${w}:${h}:${grain}:${seed}`;
	const kept = fields.get(key);
	if (kept) return kept;
	const iw = Math.max(8, Math.ceil(w * SCALE)),
		ih = Math.max(8, Math.ceil(h * SCALE));
	const lattice = (x: number, y: number, o: number) => {
		let n = (x * 374761393 + y * 668265263 + (seed * 31 + o) * 2246822519) | 0;
		n = Math.imul(n ^ (n >>> 13), 1274126177);
		return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
	};
	const smooth = (t: number) => t * t * (3 - 2 * t);
	const value = (x: number, y: number, o: number) => {
		const x0 = Math.floor(x),
			y0 = Math.floor(y),
			sx = smooth(x - x0),
			sy = smooth(y - y0);
		const a = lattice(x0, y0, o) + (lattice(x0 + 1, y0, o) - lattice(x0, y0, o)) * sx,
			b = lattice(x0, y0 + 1, o) + (lattice(x0 + 1, y0 + 1, o) - lattice(x0, y0 + 1, o)) * sx;
		return a + (b - a) * sy;
	};
	const f = grain / SCALE,
		v = new Float32Array(iw * ih);
	let lo = Infinity,
		hi = -Infinity;
	for (let y = 0; y < ih; y++)
		for (let x = 0; x < iw; x++) {
			let s = 0;
			for (let o = 0, amp = 1, fr = f; o < 4; o++, amp /= 2, fr *= 2)
				s += amp * value(x * fr, y * fr, o);
			v[y * iw + x] = s;
			lo = Math.min(lo, s);
			hi = Math.max(hi, s);
		}
	for (let i = 0; i < v.length; i++) v[i] = (v[i] - lo) / (hi - lo || 1);
	// by rank, so that as the threshold sweeps it the ink comes (or goes) evenly: noise bunches in the middle,
	// and swept as it is, a melt's first and last fifths showed almost nothing, a page change a blank paper
	const order = Array.from(v.keys()).sort((a, b) => v[a] - v[b]);
	order.forEach((i, r) => (v[i] = r / (order.length - 1 || 1)));
	const made = { w, h, iw, ih, v };
	fields.set(key, made);
	return made;
}

/** One element melting. */
interface Melt {
	node: HTMLElement | SVGElement;
	field: Field;
	/** where the noise's top lies on the element, in its own px (the top of what was in view as it began) */
	top: number;
	/** the noise's cover, small: the paper is laid through it */
	cover: CanvasRenderingContext2D;
	img: ImageData;
	/** 1 melting in, -1 melting away */
	way: 1 | -1;
	ms: number;
	t0: number;
	shown: boolean;
	done: () => void;
}
const live = new Set<Melt>();
let overlay: HTMLCanvasElement | null = null,
	loop = 0,
	turns = 0;

/** the canvas over the window, made the first time it's needed */
function canvas() {
	if (overlay) return overlay;
	overlay = document.createElement('canvas');
	overlay.setAttribute('aria-hidden', 'true');
	overlay.style.cssText =
		'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:30';
	document.body.append(overlay);
	return overlay;
}

/** Each frame: every melt moves on, and the paper is laid over what each still hides. */
function frame(now: number) {
	loop = 0;
	const paper = paperOnScreen(),
		c = canvas(),
		g = c.getContext('2d')!;
	if (paper && (c.width !== paper.width || c.height !== paper.height)) {
		c.width = paper.width;
		c.height = paper.height;
	}
	g.globalCompositeOperation = 'source-over';
	g.clearRect(0, 0, c.width, c.height);
	const k = c.width / innerWidth;
	let covered = false;
	for (const m of [...live]) {
		const p = Math.min(1, (now - m.t0) / m.ms);
		if (p >= 1) {
			live.delete(m);
			m.done(); // (what follows a melt away hides the element before this frame is painted)
			continue;
		}
		if (paper) {
			// the cover: paper where the noise is below the threshold; the highest of the noise shows first (from
			// nothing at 0 to all of it at 1, edge and all)
			const t = 1 - (1 + EDGE) * (m.way === 1 ? p : 1 - p),
				{ v } = m.field,
				a = m.img.data;
			for (let i = 0; i < v.length; i++)
				a[i * 4 + 3] = 255 - Math.round(255 * Math.min(1, Math.max(0, (v[i] - t) / EDGE)));
			m.cover.putImageData(m.img, 0, 0);
			const r = m.node.getBoundingClientRect();
			g.drawImage(
				m.cover.canvas,
				(r.left - PAD) * k,
				(r.top + m.top) * k,
				m.field.w * k,
				m.field.h * k
			);
			covered = true;
		}
		// a hidden element shows from the first frame its paper lies over it, so it never shows bare
		if (!m.shown) {
			m.shown = true;
			m.node.style.removeProperty('opacity');
		}
	}
	// the paper itself, through all the covers at once
	if (paper && covered) {
		g.globalCompositeOperation = 'source-in';
		g.drawImage(paper, 0, 0);
	}
	if (live.size) loop = requestAnimationFrame(frame);
}

/** Melts `node` in (way 1) or away (way -1) over `ms`; resolves when it's whole, or gone. */
function run(node: HTMLElement | SVGElement, ms: number, way: 1 | -1, grain: number, seed: number) {
	return new Promise<void>((done) => {
		// the noise covers the element's width and a screen and a half of its height, from the top of what is in
		// view (what lies below is off screen, and shows as it is)
		const r = node.getBoundingClientRect();
		const f = field(
			Math.ceil((r.width + 2 * PAD) / 40) * 40,
			Math.ceil((innerHeight * 1.5 + 2 * PAD) / 40) * 40,
			grain,
			seed
		);
		const cover = Object.assign(document.createElement('canvas'), {
			width: f.iw,
			height: f.ih
		}).getContext('2d')!;
		live.add({
			node,
			field: f,
			top: Math.max(0, -r.top) - PAD,
			cover,
			img: cover.createImageData(f.iw, f.ih),
			way,
			ms,
			t0: performance.now(),
			shown: false,
			done
		});
		loop ||= requestAnimationFrame(frame);
	});
}

export interface MeltOptions {
	/** ms to melt in */
	ms?: number;
	/** ms to wait first */
	delay?: number;
	/** wait until the element is in view */
	onView?: boolean;
	/** the size of the patches (the noise's base frequency: lower, larger patches) */
	grain?: number;
}

/** Melts an element in when it mounts, or when it first comes into view. */
export function melt(node: HTMLElement | SVGElement, o: MeltOptions = {}) {
	const { ms = 1100, delay = 0, onView = false, grain = 0.03 } = o;
	if (still()) return {};
	// hidden until its melt begins (its first frame of paper shows it again, underneath)
	node.style.opacity = '0';
	// what melts in as it comes into view (Teoría's sections) takes turns among the variants; a page melts in
	// with the noise it will melt away with
	const seed = onView ? ++turns % 3 : 0;
	let gone = false,
		seen: IntersectionObserver | null = null,
		t = 0;
	const start = () => (t = window.setTimeout(() => !gone && run(node, ms, 1, grain, seed), delay));
	if (onView) {
		seen = new IntersectionObserver(
			(es) => {
				if (es.some((e) => e.isIntersecting)) {
					seen?.disconnect();
					start();
				}
			},
			{ threshold: 0.15 }
		);
		seen.observe(node);
	} else start();
	return {
		destroy() {
			gone = true;
			clearTimeout(t);
			seen?.disconnect();
			for (const m of live) if (m.node === node) live.delete(m);
		}
	};
}

/** Melts an element away; resolves once it is gone (it stays hidden). */
export async function meltAway(node: HTMLElement, ms = 450, grain = 0.03) {
	if (still()) return;
	await run(node, ms, -1, grain, 0);
	node.style.visibility = 'hidden';
}

/** Melts an element (back) in; resolves once it is whole. */
export async function meltIn(node: HTMLElement, ms = 600, grain = 0.03) {
	node.style.visibility = '';
	if (still()) return;
	node.style.opacity = '0';
	await run(node, ms, 1, grain, 0);
}
