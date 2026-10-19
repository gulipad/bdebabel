/**
 * The bare paper on screen right now, as a canvas the size of the window (the city's Sheet, or the cover's own
 * bare sheet): melts (melt.ts) cover what they hide with a copy of it, so that what is hidden looks like paper.
 */
let current: HTMLCanvasElement | null = null;

/** Registers the paper on screen; returns the way to take it back off. */
export function showPaper(c: HTMLCanvasElement) {
	current = c;
	return () => {
		if (current === c) current = null;
	};
}

export const paperOnScreen = () => current;
