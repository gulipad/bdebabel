/**
 * Whether the reader has moved within the city in this visit (a refresh or a link from outside starts a new
 * visit). The cover plays its full entrance only when it is where a visit starts.
 */
let within = false;

/** called by the layout on every navigation inside the city */
export const movedWithin = () => {
	within = true;
};
export const hasMovedWithin = () => within;
