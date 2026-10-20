<script lang="ts">
	/**
	 * A temporary editor, for the dev server only: with ?editar, every heading and paragraph of `root` (outside
	 * the figures) can be written on in place. Enter splits a paragraph in two, Backspace at a paragraph's start
	 * joins it to the one before. «Guardar» sends the whole sequence, each block as it was and as it is now, to
	 * the dev server (vite.config.ts), which keeps it in app/.edits/<name>.json to be put into the source.
	 */
	import { onMount } from 'svelte';

	let { root, name }: { root: HTMLElement; name: string } = $props();

	/** a block of text: its number among the page's own (null for one written here) and its text as it was */
	interface Block {
		el: HTMLElement;
		n: number | null;
		was: string;
	}
	let saved = $state(''),
		count = $state(0);
	// not reactive: read only on input and on save
	const blocks: Block[] = [];
	const clean = (html: string) =>
		html
			.replace(/<!--[^>]*-->/g, '')
			.replace(/<br>$/, '')
			.trim();

	function editable(el: HTMLElement, n: number | null) {
		el.contentEditable = 'true';
		el.spellcheck = true;
		el.classList.add('editable');
		el.addEventListener('keydown', (e) => key(e, el));
		blocks.push({ el, n, was: n === null ? '' : clean(el.innerHTML) });
	}

	onMount(() => {
		let n = 0;
		for (const el of root.querySelectorAll<HTMLElement>('h1, h2, h3, p'))
			if (!el.closest('figure')) editable(el, ++n);
		const watch = () => (count = summary().changes);
		root.addEventListener('input', watch);
		return () => root.removeEventListener('input', watch);
	});

	/** where the cursor is in `el`: the range from it to the end, and whether it is at the very start */
	function caret(el: HTMLElement) {
		const sel = getSelection();
		if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return null;
		const at = sel.getRangeAt(0),
			head = document.createRange(),
			tail = document.createRange();
		head.setStart(el, 0);
		head.setEnd(at.startContainer, at.startOffset);
		tail.setStart(at.endContainer, at.endOffset);
		tail.setEnd(el, el.childNodes.length);
		return { tail, atStart: at.collapsed && head.toString() === '', sel };
	}

	function key(e: KeyboardEvent, el: HTMLElement) {
		if (e.isComposing) return;
		const c = caret(el);
		if (!c) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			// a new paragraph after this one, with what followed the cursor
			e.preventDefault();
			const next = document.createElement('p');
			next.append(c.tail.extractContents());
			if (!next.textContent) next.innerHTML = '<br>';
			el.after(next);
			editable(next, null);
			const r = document.createRange();
			r.setStart(next, 0);
			c.sel.removeAllRanges();
			c.sel.addRange(r);
			next.focus();
			count = summary().changes;
		} else if (e.key === 'Backspace' && c.atStart) {
			// joined to the paragraph before it (only paragraph to paragraph)
			const prev = el.previousElementSibling as HTMLElement | null;
			if (!prev || el.tagName !== 'P' || prev.tagName !== 'P' || !prev.isContentEditable) return;
			e.preventDefault();
			const mark = document.createRange();
			mark.selectNodeContents(prev);
			mark.collapse(false);
			if (prev.innerHTML === '<br>') prev.innerHTML = '';
			if (el.innerHTML !== '<br>') prev.append(...el.childNodes);
			el.remove();
			c.sel.removeAllRanges();
			c.sel.addRange(mark);
			prev.focus();
			count = summary().changes;
		}
	}

	/** every block in the page's order now, what became of each, and the page's own that are gone */
	function summary() {
		const on = blocks
			.filter((b) => b.el.isConnected)
			.sort((a, b) =>
				a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
			)
			.map((b) => {
				const now = clean(b.el.innerHTML);
				const what = b.n === null ? 'new' : now === b.was ? 'same' : 'changed';
				return { n: b.n, tag: b.el.tagName.toLowerCase(), what, before: b.was, after: now };
			});
		const gone = blocks
			.filter((b) => !b.el.isConnected && b.n !== null)
			.map((b) => ({ n: b.n, before: b.was }));
		return { on, gone, changes: on.filter((b) => b.what !== 'same').length + gone.length };
	}

	async function save() {
		const { on, gone, changes } = summary();
		const res = await fetch('/__edits', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, at: new Date().toISOString(), blocks: on, removed: gone })
		});
		saved = res.ok
			? `Guardado: ${changes} ${changes === 1 ? 'cambio' : 'cambios'}`
			: `No se pudo guardar (${res.status})`;
	}
</script>

<div class="bar" role="toolbar" aria-label="Editor">
	<span>Editando · {count} {count === 1 ? 'cambio' : 'cambios'}</span>
	{#if saved}<span class="saved">{saved}</span>{/if}
	<button type="button" onclick={save}>Guardar</button>
</div>

<style>
	.bar {
		position: fixed;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.55rem 0.7rem 0.55rem 1.1rem;
		background: rgba(251, 247, 238, 0.97);
		border: 1px solid var(--rule);
		box-shadow: 0 10px 30px -18px rgba(0, 0, 0, 0.5);
		font: italic 1rem var(--display);
		color: var(--ink-dry);
	}
	.saved {
		color: var(--madder);
	}
	button {
		border: 1px solid var(--sepia);
		background: var(--sepia);
		color: rgb(251 247 238);
		font: 0.95rem var(--display-sc);
		letter-spacing: 0.12em;
		padding: 0.35rem 0.9rem;
		cursor: pointer;
	}
	:global(.editable) {
		outline: 1px dashed transparent;
		outline-offset: 4px;
		transition: outline-color 0.2s;
	}
	:global(.editable:hover),
	:global(.editable:focus) {
		outline-color: rgba(164, 71, 59, 0.45);
	}
</style>
