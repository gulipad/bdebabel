/**
 * Melting, the city's one transition, for HTML: an element comes and goes the way the ink does on the cover,
 * in blotchy patches, through an SVG filter whose threshold rises with a noise field. `melt` is an action that
 * melts an element in when it mounts (or comes into view); `meltAway` melts one out and resolves when it's gone.
 */
const NS = 'http://www.w3.org/2000/svg';
let made = 0;

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A filter of its own for one element; `set(p)` shows that much of it (0..1). */
function filter(grain: number) {
	const id = `melt-${++made}`;
	const svg = document.createElementNS(NS, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
	svg.innerHTML = `<filter id="${id}" x="-4%" y="-4%" width="108%" height="108%">
		<feTurbulence type="fractalNoise" baseFrequency="${grain}" numOctaves="4" seed="${made % 89}" />
		<feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" />
		<feComponentTransfer result="m"><feFuncA type="linear" slope="8" intercept="-6" /></feComponentTransfer>
		<feComposite in="SourceGraphic" in2="m" operator="in" />
	</filter>`;
	document.body.append(svg);
	const a = svg.querySelector('feFuncA')!;
	return {
		id,
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
	const f = filter(grain);
	f.set(0);
	node.style.filter = `url(#${f.id})`;
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
	const f = filter(grain);
	f.set(1);
	node.style.filter = `url(#${f.id})`;
	await run(ms, (p) => f.set(1 - p));
	node.style.visibility = 'hidden';
	node.style.filter = '';
	f.remove();
}
