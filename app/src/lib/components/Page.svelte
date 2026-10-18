<script lang="ts">
	/** One leaf of the Library: its catalogue slip (where it is, how far) and its text, exactly as stored. */
	import { locate, steps } from '#lib/address.ts';
	import Trail from '#lib/browse/Trail.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import type { PageResult } from '#lib/universe/protocol.ts';

	let { page, highlight }: { page: PageResult; highlight?: { offset: number; length: number } } =
		$props();

	const where = $derived(locate(page.address));

	/** the whole address, hexagon and all, onto the clipboard (the old way where the clipboard is refused) */
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(page.address);
		} catch {
			const t = Object.assign(document.createElement('textarea'), { value: page.address });
			document.body.append(t);
			t.select();
			document.execCommand('copy');
			t.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 2200);
	}

	/** Paragraphs as the page writes them; the searched sentence, if any, set apart. */
	const paragraphs = $derived.by(() => {
		const out: { parts: { text: string; found: boolean }[]; dialogue: boolean }[] = [];
		let pos = 0;
		for (const raw of page.text.split('\n')) {
			const start = pos;
			pos += raw.length + 1;
			if (!raw.trim()) continue;
			const parts: { text: string; found: boolean }[] = [];
			const a = highlight ? Math.max(highlight.offset - start, 0) : -1;
			const b = highlight ? Math.min(highlight.offset + highlight.length - start, raw.length) : -1;
			if (highlight && a < raw.length && b > 0 && a < b) {
				if (a > 0) parts.push({ text: raw.slice(0, a), found: false });
				parts.push({ text: raw.slice(a, b), found: true });
				if (b < raw.length) parts.push({ text: raw.slice(b), found: false });
			} else parts.push({ text: raw, found: false });
			out.push({ parts, dialogue: /^\s*[—–-]/.test(raw) });
		}
		return out;
	});
</script>

<section class="leaf">
	<div class="slip" aria-label="Ficha de la página">
		<p class="far"><span>{page.ring}.</span> {steps(page.bits)} pasos del centro.</p>
		<div class="where">
			{#if where}<Trail {where} />{/if}
			<InkLink small onclick={copy}>{copied ? 'Copiada' : 'Copiar la dirección'}</InkLink>
		</div>
	</div>

	<article>
		{#each paragraphs as p, i (i)}
			<!-- a capital only when the page opens on a letter, not on a dash or a ¡ -->
			<p class:dlg={p.dialogue} class:initial={i === 0 && /^\p{L}/u.test(p.parts[0].text)}>
				{#each p.parts as part, j (j)}{#if part.found}<mark>{part.text}</mark
						>{:else}{part.text}{/if}{/each}
			</p>
		{/each}
		{#if where}<div class="folio">— {where.page} —</div>{/if}
	</article>
</section>

<style>
	.leaf {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}
	.slip {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.far {
		margin: 0;
		font: italic 1.05rem var(--display);
		color: var(--ink-faint);
	}
	.far span {
		font-style: normal;
		font-family: var(--display-sc);
		letter-spacing: 0.1em;
		color: var(--ink);
	}
	/* where the page is, and its address to take away, on one line */
	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.3rem 1rem;
	}
	article {
		background: rgba(251, 247, 238, 0.72);
		border: 1px solid var(--rule);
		padding: 2.4rem clamp(1.1rem, 6vw, 3.2rem) 1.8rem;
		box-shadow: 0 18px 40px -28px rgba(0, 0, 0, 0.35);
	}
	article p {
		font-size: 1.14rem;
		line-height: 1.6;
		margin: 0 0 0.85em;
		hyphens: auto;
		text-align: justify;
		color: var(--ink);
	}
	article p.dlg {
		text-align: left;
	}
	article p.initial::first-letter {
		float: left;
		font-family: var(--display);
		font-size: 3.3em;
		line-height: 0.85;
		padding: 0.06em 0.08em 0 0;
		color: var(--madder);
	}
	mark {
		background: none;
		color: var(--madder);
		text-decoration: underline wavy rgba(164, 71, 59, 0.5);
		text-underline-offset: 0.25em;
	}
	.folio {
		font-family: var(--mono);
		font-size: 0.72rem;
		color: var(--ink-faint);
		text-align: center;
		margin-top: 1.4rem;
		letter-spacing: 0.08em;
	}
</style>
