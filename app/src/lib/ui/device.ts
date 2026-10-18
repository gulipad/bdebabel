/** A phone or a tablet: a finger for a pointer, and nothing to hover with. */
export const handheld = () =>
	matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches;
