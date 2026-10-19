/**
 * Melting, the city's one transition, for HTML: an element comes and goes the way the ink does on the cover,
 * in blotchy patches that grow out of a noise field. `melt` is an action that melts an element in when it mounts
 * (or comes into view); `meltAway` melts one out and resolves when it's gone.
 *
 * It is a CSS mask, switched frame by frame through a few precomputed images of the patches. An SVG filter
 * (feTurbulence, thresholded) recomputed the noise over the whole screen every frame, which an iPhone, at three
 * device pixels to the CSS pixel, could only do a few times a second: the melts stuttered. Swapping a mask is
 * a cheap thing for any browser to draw.
 */
import { handheld } from './device.ts';

let made = 0;

/**
 * reduced motion keeps things still on a desktop; on a phone or a tablet the melts run anyway, as the cover's
 * leaving always did: they are ink dissolving in place, nothing moves
 */
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches && !handheld();

/** the images a melt steps through: more are smoother and cost a little more to make, once */
const FRAMES = 24,
	/** image px per css px: the patches are tens of px wide, so a quarter is plenty (the mask is smoothed up) */
	SCALE = 0.25,
	/** how far the mask reaches beyond the element's box, for what overflows it a little */
	PAD = 24;

/**
 * The frames of a melt, `w` × `h` css px: blotchy fractal value noise (four octaves, like feTurbulence's
 * fractalNoise) and, frame by frame, what of it is inked, from none to all, with a soft edge. Elements of a size
 * share them (in three variants, so neighbours don't melt alike).
 *
 * They are decoded before a melt starts, and kept: Safari on an iPhone decodes an image only when it is first
 * drawn, so a mask swapped in undecoded showed the element whole (or not at all) for a frame, and the melts
 * flashed.
 */
const framed = new Map<string, Promise<string[]>>();
const keep: HTMLImageElement[] = [];
function frames(w: number, h: number, grain: number, seed: number) {
	const key = `${w}:${h}:${grain}:${seed}`;
	let job = framed.get(key);
	if (!job) framed.set(key, (job = draw(w, h, grain, seed)));
	return job;
}
async function draw(w: number, h: number, grain: number, seed: number) {
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
		field = new Float32Array(iw * ih);
	let lo = Infinity,
		hi = -Infinity;
	for (let y = 0; y < ih; y++)
		for (let x = 0; x < iw; x++) {
			let v = 0;
			for (let o = 0, amp = 1, fr = f; o < 4; o++, amp /= 2, fr *= 2)
				v += amp * value(x * fr, y * fr, o);
			field[y * iw + x] = v;
			lo = Math.min(lo, v);
			hi = Math.max(hi, v);
		}
	for (let i = 0; i < field.length; i++) field[i] = (field[i] - lo) / (hi - lo || 1);
	// each frame on its own canvas, so that they are all encoded at once
	const out = await Promise.all(
		Array.from({ length: FRAMES }, async (_, k) => {
			const c = document.createElement('canvas');
			c.width = iw;
			c.height = ih;
			const g = c.getContext('2d')!,
				img = g.createImageData(iw, ih);
			// the highest of the noise inks first; the threshold sinks from above it to below its lowest
			const t = 1.1 - (1.2 * k) / (FRAMES - 1);
			for (let i = 0; i < field.length; i++)
				img.data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (field[i] - t) / 0.07)));
			g.putImageData(img, 0, 0);
			const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/png'));
			return blob ? URL.createObjectURL(blob) : c.toDataURL('image/png');
		})
	);
	await Promise.all(
		out.map((src) => {
			const im = new Image();
			im.src = src;
			keep.push(im);
			return im.decode().catch(() => undefined);
		})
	);
	return out;
}

/**
 * A mask of its own for one element: `ready()` makes (or finds) its frames, `set(p)` shows that much of the
 * element (0..1), `remove()` takes the mask off.
 */
function mask(node: HTMLElement | SVGElement, grain: number, seed = ++made % 3) {
	const st = node.style;
	let shots: string[] | null = null,
		size = { w: 0, h: 0 },
		shown = '';
	const put = (k: string, v: string) => {
		st.setProperty(k, v);
		st.setProperty(`-webkit-${k}`, v);
	};
	const off = () => {
		for (const k of ['mask-image', 'mask-size', 'mask-position', 'mask-repeat'])
			for (const p of [k, `-webkit-${k}`]) st.removeProperty(p);
	};
	return {
		async ready() {
			// the frames cover the element's width and a screen and a half of its height, from the top of what is
			// in view (what lies below is hidden only while the melt lasts)
			const r = node.getBoundingClientRect();
			size = {
				w: Math.ceil((r.width + 2 * PAD) / 40) * 40,
				h: Math.ceil((innerHeight * 1.5 + 2 * PAD) / 40) * 40
			};
			shots = await frames(size.w, size.h, grain, seed);
		},
		set: (p: number) => {
			if (!shots) {
				// hidden, waiting for its frames: a mask with nothing in it
				put('mask-image', 'linear-gradient(transparent, transparent)');
				return;
			}
			const top = Math.max(0, -node.getBoundingClientRect().top) - PAD,
				now = `${shots[Math.round(p * (FRAMES - 1))]} ${top}`;
			if (now === shown) return; // the same frame, in the same place: nothing to redraw
			shown = now;
			put('mask-image', `url(${shots[Math.round(p * (FRAMES - 1))]})`);
			put('mask-size', `${size.w}px ${size.h}px`);
			put('mask-position', `${-PAD}px ${top}px`);
			put('mask-repeat', 'no-repeat');
		},
		remove: off
	};
}

function run(ms: number, step: (p: number) => void) {
	return new Promise<void>((done) => {
		const t0 = performance.now();
		const tick = (now: number) => {
			const p = Math.min(1, (now - t0) / ms);
			step(p);
			if (p < 1) requestAnimationFrame(tick);
			else done();
		};
		requestAnimationFrame(tick);
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
	// what melts in as it comes into view (Teoría's sections) takes turns among the variants; a page melts in
	// with the frames it will melt away with, so leaving finds them ready
	const f = onView ? mask(node, grain) : mask(node, grain, 0);
	f.set(0);
	let gone = false,
		seen: IntersectionObserver | null = null;
	const start = () =>
		setTimeout(async () => {
			await f.ready();
			if (gone) return;
			await run(ms, f.set);
			if (!gone) f.remove();
		}, delay);
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
			seen?.disconnect();
			f.remove();
		}
	};
}

/** Melts an element away; resolves once it is gone (it stays hidden). */
export async function meltAway(node: HTMLElement, ms = 450, grain = 0.03) {
	if (still()) return;
	const f = mask(node, grain, 0);
	await f.ready();
	f.set(1);
	await run(ms, (p) => f.set(1 - p));
	node.style.visibility = 'hidden';
	f.remove();
}

/** Melts an element (back) in; resolves once it is whole. */
export async function meltIn(node: HTMLElement, ms = 600, grain = 0.03) {
	node.style.visibility = '';
	if (still()) return;
	const f = mask(node, grain, 0);
	f.set(0);
	await f.ready();
	await run(ms, f.set);
	f.remove();
}
