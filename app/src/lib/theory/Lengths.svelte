<script lang="ts">
	/** How long an address is, in bits, for the same 3.200 characters: ours, Basile's, and noise in ours. */
	import { steps } from '#lib/address.ts';
	import { lang } from '#lib/i18n.ts';
	import { seen } from '#lib/ui/seen.ts';

	const TEXT = {
		es: {
			rows: [
				{ name: 'Una página de esta Biblioteca', bits: 2300, chars: '≈ 390 caracteres' },
				{ name: 'Una página de la de Basile', bits: 15500, chars: '≈ 3.000 caracteres' },
				{ name: 'Ruido puro, en esta Biblioteca', bits: 19500, chars: '≈ 3.300 caracteres' }
			],
			caption: 'Longitud de la dirección de una página de 3.200 caracteres.'
		},
		en: {
			rows: [
				{ name: 'A page of this Library', bits: 2300, chars: '≈ 385 characters' },
				{ name: "A page of Basile's", bits: 15500, chars: '≈ 3,000 characters' },
				{ name: 'Pure noise, in this Library', bits: 19400, chars: '≈ 3,250 characters' }
			],
			caption: 'The length of the address of a page of 3,200 characters.'
		}
	};
	const l = lang();
	const ROWS = TEXT[l].rows;
	const MAX = 20000;
	let on = $state(false);
</script>

<figure use:seen={(v) => (on = v)} class:on>
	{#each ROWS as r, i (r.name)}
		<div class="row">
			<p class="name">{r.name}</p>
			<div class="track">
				<span class="bar inked" style:--w={r.bits / MAX} style:--d="{i * 0.35}s"></span>
				<span class="value">{steps(r.bits, l)} bits · {r.chars}</span>
			</div>
		</div>
	{/each}
	<figcaption>{TEXT[l].caption}</figcaption>
</figure>

<style>
	figure {
		margin: 2rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.name {
		margin: 0 0 0.2rem;
		font: italic 1.05rem var(--display);
		color: var(--ink-dry);
	}
	.track {
		position: relative;
		height: 1.6rem;
		border-bottom: 1px solid var(--rule);
	}
	.bar {
		position: absolute;
		left: 0;
		top: 0.35rem;
		height: 0.9rem;
		width: 0;
		background: var(--sepia);
		opacity: 0.82;
		transition: width 1.4s cubic-bezier(0.3, 0.6, 0.2, 1);
		transition-delay: var(--d);
	}
	.on .bar {
		width: max(3px, calc(var(--w) * 100%));
	}
	.value {
		position: absolute;
		right: 0;
		top: -1.35rem;
		font: 0.74rem var(--mono);
		color: var(--ink-faint);
	}
	figcaption {
		text-align: center;
		font: italic 1.02rem var(--display);
		color: var(--ink-faint);
	}
</style>
