/**
 * Enter in a text box: on its own it submits; with Shift, Cmd, Ctrl or Alt it breaks the line (browsers
 * only do that for Shift, so the others are written in by hand, keeping undo where the browser allows).
 */
export function enterSubmits(e: KeyboardEvent, submit: () => void) {
	if (e.key !== 'Enter' || e.isComposing) return;
	if (!e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
		e.preventDefault();
		submit();
		return;
	}
	if (e.shiftKey) return;
	e.preventDefault();
	const box = e.currentTarget as HTMLTextAreaElement;
	if (!document.execCommand?.('insertText', false, '\n')) {
		box.setRangeText('\n', box.selectionStart, box.selectionEnd, 'end');
		box.dispatchEvent(new Event('input', { bubbles: true }));
	}
}
