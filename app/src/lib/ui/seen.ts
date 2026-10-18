import { handheld } from './device.ts';

/** An action: calls `on(true)` the first time the element comes into view (and stops watching). */
export function seen(node: Element, on: (v: boolean) => void) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches && !handheld()) {
		on(true);
		return {};
	}
	const io = new IntersectionObserver(
		(es) => {
			if (es.some((e) => e.isIntersecting)) {
				io.disconnect();
				on(true);
			}
		},
		{ threshold: 0.3 }
	);
	io.observe(node);
	return { destroy: () => io.disconnect() };
}

/** An action for what loops: calls `on(true)` whenever the element comes into view and `on(false)` when it leaves. */
export function inView(node: Element, on: (v: boolean) => void) {
	const io = new IntersectionObserver((es) => on(es.some((e) => e.isIntersecting)), {
		threshold: 0.1
	});
	io.observe(node);
	return { destroy: () => io.disconnect() };
}
