/**
 * Melting, the city's one transition, for HTML: an element comes and goes the way the ink does on the cover,
 * in blotchy patches, through an SVG filter whose threshold rises with a noise field. `melt` is an action that
 * melts an element in when it mounts (or comes into view); `meltAway` melts one out and resolves when it's gone.
 */
const NS = 'http://www.w3.org/2000/svg';
let made = 0;

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The part of an element the filter works on: what is on screen (from the element's top if it is still below),
 * at most ~4,000 device pixels tall. Safari draws nothing at all through a filter taller than that, and a long
 * page on a phone (Teoría is ~8,000 px, ×3 on an iPhone) is far taller. What lies outside it is off screen and
 * hidden only while the melt lasts. In the element's own pixels, which is what userSpaceOnUse means for HTML.
 */
function region(node: HTMLElement | SVGElement) {
	const r = node.getBoundingClientRect(),
		pad = 24;
	const tall = Math.floor(4000 / Math.max(1, devicePixelRatio || 1));
	const top = Math.min(Math.max(0, -r.top - pad), Math.max(0, r.height - tall));
	return {
		x: -pad,
		y: top - pad,
		width: r.width + 2 * pad,
		height: Math.min(r.height - top + 2 * pad, tall)
	};
}

/** A filter of its own for one element; `set(p)` shows that much of it (0..1). */
function filter(node: HTMLElement | SVGElement, grain: number) {
	const id = `melt-${++made}`;
	const { x, y, width, height } = region(node);
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
	svg.innerHTML = `<filter id="${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}">
		<feTurbulence type="fractalNoise" baseFrequency="${grain}" numOctaves="4" seed="${made % 89}" />
		<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" />
		<feComponentTransfer result="m"><feFuncA type="linear" slope="8" intercept="-6" /></feComponentTransfer>
		<feComposite in="SourceGraphic" in2="m" operator="in" />
	</filter>`;
	document.body.append(svg);
	const a = svg.querySelector('feFuncA')!;
	node.style.filter = `url(#${id})`;
	return {
		set: (p: number) => a.setAttribute('intercept', String(-5.8 + p * 4.6)),
		remove: () => svg.remove()
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
	const f = filter(node, grain);
	f.set(0);
	let gone = false,
		seen: IntersectionObserver | null = null;
	const start = () =>
		setTimeout(
			() =>
				!gone &&
				run(ms, f.set).then(() => {
					if (gone) return;
					node.style.filter = '';
					f.remove();
				}),
			delay
		);
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
	const f = filter(node, grain);
	f.set(1);
	await run(ms, (p) => f.set(1 - p));
	node.style.visibility = 'hidden';
	node.style.filter = '';
	f.remove();
}

/** Melts an element (back) in; resolves once it is whole. */
export async function meltIn(node: HTMLElement, ms = 600, grain = 0.03) {
	node.style.visibility = '';
	if (still()) return;
	const f = filter(node, grain);
	f.set(0);
	await run(ms, f.set);
	node.style.filter = '';
	f.remove();
}
