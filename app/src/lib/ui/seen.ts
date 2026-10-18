/** An action: calls `on(true)` the first time the element comes into view (and stops watching). */
export function seen(node: Element, on: (v: boolean) => void) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
