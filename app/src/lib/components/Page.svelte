<script lang="ts">
	/** One leaf of the Library: its catalogue slip (where it is, how far) and its text, exactly as stored. */
	import { locate, steps } from '#lib/address.ts';
	import type { PageResult } from '#lib/universe/protocol.ts';

	let { page, highlight }: { page: PageResult; highlight?: { offset: number; length: number } } =
		$props();

	const where = $derived(locate(page.address));

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
		<div class="row">
			<span>Universo <b>{where?.universe ?? '—'}</b></span>
			<span><b>{steps(page.bits)}</b> pasos del centro · {page.ring}</span>
		</div>
		{#if where}
			<div class="coords">
				<span><i>muro</i>{where.wall}</span><span><i>anaquel</i>{where.shelf}</span>
				<span><i>volumen</i>{where.volume}</span><span><i>página</i>{where.page}</span>
			</div>
		{/if}
		<details>
			<summary>Hexágono (la dirección completa)</summary>
			<div class="hex">{page.address}</div>
		</details>
	</div>

	<article>
		{#each paragraphs as p, i (i)}
			<p class:dlg={p.dialogue}>
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
		font-family: var(--mono);
		font-size: 0.74rem;
		color: var(--ink-faint);
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.4rem;
	}
	b {
		color: var(--ink);
		font-weight: 500;
	}
	.coords {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.coords span {
		border: 1px solid var(--rule);
		padding: 0.15rem 0.45rem;
		font-variant-numeric: tabular-nums;
	}
	.coords i {
		font-style: normal;
		margin-right: 0.3rem;
	}
	summary {
		cursor: pointer;
	}
	.hex {
		word-break: break-all;
		line-height: 1.55;
		color: var(--ink);
		margin-top: 0.4rem;
		max-height: 9em;
		overflow: auto;
		user-select: all;
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
	article p:first-of-type::first-letter {
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
