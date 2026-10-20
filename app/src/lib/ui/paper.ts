/**
 * The bare paper on screen right now, as a canvas the size of the window (the city's Sheet, drawn where the page
 * has scrolled it to; or the cover's own bare sheet): melts (melt.ts) cover what they hide with a copy of it,
 * so that what is hidden looks like paper.
 */
type Source = HTMLCanvasElement | (() => HTMLCanvasElement);
let current: Source | null = null;

/** Registers the paper on screen; returns the way to take it back off. */
export function showPaper(source: Source) {
	current = source;
	return () => {
		if (current === source) current = null;
	};
}

export const paperOnScreen = () => (typeof current === 'function' ? current() : current);
