<script lang="ts">
	/**
	 * Basile's Library: an address and a page are the same thing, disguised. Every so often another address
	 * comes up, and its page with it; both arrows of the function are always there.
	 */
	import { lang } from '#lib/i18n.ts';
	import { inView } from '#lib/ui/seen.ts';

	const TEXT = {
		es: {
			address: 'La dirección',
			addressNote: '≈ 3.000 caracteres',
			open: 'abrir →',
			search: '← buscar',
			page: 'La página',
			pageNote: '3.200 caracteres, de 29 símbolos',
			caption:
				'La función va en los dos sentidos. Ninguna página está guardada en ningún sitio, porque la dirección ya contiene la página entera, codificada.'
		},
		en: {
			address: 'The address',
			addressNote: '≈ 3,000 characters',
			open: 'open →',
			search: '← search',
			page: 'The page',
			pageNote: '3,200 characters, of 29 symbols',
			caption:
				'The function goes both ways. No page is stored anywhere, because the address already contains the whole page, encoded.'
		}
	};
	const t = TEXT[lang()];

	let on = $state(false),
		tick = $state(0);
	$effect(() => {
		if (!on) return;
		const t = setInterval(() => tick++, 2200);
		return () => clearInterval(t);
	});

	const B36 = '0123456789abcdefghijklmnopqrstuvwxyz',
		B29 = 'abcdefghijklmnopqrstuvwxyz ,.';
	function rng(seed: number) {
		let s = seed * 2654435761 + 1;
		return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ 0x9e3779b9) >>> 0) / 4294967296;
	}
	const pick = (r: () => number, a: string, n: number) =>
		Array.from({ length: n }, () => a[Math.floor(r() * a.length)]).join('');
	const address = $derived.by(() => pick(rng(tick + 1), B36, 120));
	const lines = $derived.by(() => {
		const r = rng(tick + 77);
		return Array.from({ length: 6 }, () => pick(r, B29, 40));
	});
</script>

<!-- it runs only while it is on screen -->
<figure use:inView={(v) => (on = v)}>
	<div class="pair">
		<div class="box">
			<p class="label">{t.address}</p>
			<p class="address">{address}…</p>
			<p class="note">{t.addressNote}</p>
		</div>
		<div class="arrows" aria-hidden="true">
			<span>{t.open}</span>
			<span>{t.search}</span>
		</div>
		<div class="box page">
			<p class="label">{t.page}</p>
			{#each lines as l, i (i)}<p class="line">{l}</p>{/each}
			<p class="note">{t.pageNote}</p>
		</div>
	</div>
	<figcaption>{t.caption}</figcaption>
</figure>

<style>
	figure {
		margin: 2rem 0;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		gap: 1rem;
		align-items: center;
	}
	@media (max-width: 34rem) {
		.pair {
			grid-template-columns: 1fr;
		}
		.arrows {
			flex-direction: row !important;
			justify-content: center;
		}
	}
	.box {
		border: 1px solid var(--rule);
		padding: 0.8rem 0.9rem;
		background: rgba(251, 247, 238, 0.5);
		min-width: 0;
	}
	.label {
		margin: 0 0 0.4rem;
		font: 0.95rem var(--display-sc);
		letter-spacing: 0.12em;
		color: var(--ink);
	}
	.address,
	.line {
		margin: 0;
		font: 0.72rem/1.5 var(--mono);
		color: var(--ink-dry);
		word-break: break-all;
		transition: opacity 0.3s;
	}
	.line {
		white-space: pre;
		overflow: hidden;
	}
	.note {
		margin: 0.4rem 0 0;
		font: italic 0.9rem var(--display);
		color: var(--ink-faint);
	}
	.arrows {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		font: italic 1rem var(--display);
		color: var(--sepia);
		white-space: nowrap;
	}
	figcaption {
		text-align: center;
		font: italic 1.02rem var(--display);
		color: var(--ink-faint);
		margin-top: 0.8rem;
	}
</style>
