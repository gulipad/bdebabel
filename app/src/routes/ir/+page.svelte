<script lang="ts">
	/** Ir: to an address you have; or, by chance, to a room to walk into, or to a page. */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { seed } from '#lib/address.ts';
	import AddressBox from '#lib/browse/AddressBox.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { door } from '#lib/universe/door.svelte.ts';
	import { universe } from '#lib/universe/client.ts';

	let busy = $state(''),
		error = $state('');

	async function go(what: 'page' | 'room') {
		if (busy) return;
		error = '';
		try {
			await door.need('Para ir al azar');
		} catch {
			return; // not now
		}
		busy = what === 'room' ? 'Buscando una sala…' : 'El Bibliotecario escoge una página…';
		try {
			const u = universe();
			if (what === 'room') {
				const r = await u.room(seed());
				await goto(resolve('/sala/[hexagon]', { hexagon: r.hexagon }));
			} else {
				const p = await u.random(seed());
				await goto(resolve('/[address]', { address: p.address }));
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			busy = '';
		}
	}
</script>

<svelte:head><title>Ir · La Biblioteca de Babel</title></svelte:head>

<section class="ir">
	<h1>Ir al azar</h1>
	<p class="hint">
		Cada sala tiene cuatro muros con cinco baldas, 32 libros por balda y 410 páginas por libro.
	</p>
	<div class="ways">
		<figure>
			<button
				type="button"
				class="icon"
				tabindex="-1"
				aria-hidden="true"
				onclick={() => go('room')}
			>
				<svg viewBox="0 0 120 120" aria-hidden="true">
					{#each [0, 1, 2, 3, 4, 5] as k (k)}
						{@const a = (Math.PI / 3) * k}
						{@const b = (Math.PI / 3) * (k + 1)}
						{#if k !== 1 && k !== 4}
							<line
								class="ink"
								x1={60 + 44 * Math.cos(a)}
								y1={60 + 44 * Math.sin(a)}
								x2={60 + 44 * Math.cos(b)}
								y2={60 + 44 * Math.sin(b)}
							/>
							<line
								class="ink"
								x1={60 + 39 * Math.cos(a)}
								y1={60 + 39 * Math.sin(a)}
								x2={60 + 39 * Math.cos(b)}
								y2={60 + 39 * Math.sin(b)}
							/>
						{/if}
					{/each}
					<circle class="ink fine" cx="60" cy="60" r="8" />
				</svg>
			</button>
			<InkLink onclick={() => go('room')}>Una sala al azar</InkLink>
			<figcaption>Para escoger tú el muro, la balda, el libro y la página.</figcaption>
		</figure>
		<figure>
			<button
				type="button"
				class="icon"
				tabindex="-1"
				aria-hidden="true"
				onclick={() => go('page')}
			>
				<svg viewBox="0 0 120 120" aria-hidden="true">
					<path class="ink" d="M34 18 h46 l14 14 v70 h-60 z M80 18 v14 h14" />
					{#each [40, 48, 56, 64, 72, 80, 88] as y (y)}
						<line class="ink fine" x1="42" x2={y % 16 ? 84 : 76} y1={y} y2={y} />
					{/each}
				</svg>
			</button>
			<InkLink onclick={() => go('page')}>Una página al azar</InkLink>
			<figcaption>Una dirección cualquiera, y su página.</figcaption>
		</figure>
	</div>
	{#if busy}<p class="busy" role="status">{busy}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<section class="address" use:melt={{ delay: 300 }}>
		<h2>O a una dirección</h2>
		<p class="lede">
			Pega lo que tengas: el nombre o el enlace de una sala, o la dirección de una página. Si
			quieres, completa el muro, la balda, el libro y la página.
		</p>
		<AddressBox />
	</section>
</section>

<style>
	.ir {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}
	h1 {
		margin: 0;
		font: 400 2rem var(--display-sc);
		letter-spacing: 0.14em;
		color: var(--ink);
	}
	.lede {
		margin: 0;
		font-size: 1.12rem;
		max-width: 36rem;
	}
	.address {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		margin-top: 2.2rem;
		padding-top: 1.8rem;
		border-top: 1px solid var(--rule);
	}
	h2 {
		margin: 0;
		font: 400 1.35rem var(--display-sc);
		letter-spacing: 0.12em;
		color: var(--ink);
	}
	.hint {
		margin: 0;
		font: italic 1.02rem var(--display);
		color: var(--ink-faint);
	}
	.ways {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 1.6rem;
	}
	figure {
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.4rem;
	}
	/* the drawing takes you too, and the way under it answers as if it were hovered */
	.icon {
		padding: 0;
		border: 0;
		background: none;
		cursor: pointer;
	}
	svg {
		display: block;
		width: 6rem;
		height: 6rem;
	}
	figure:has(.icon:hover) :global(.way) {
		transform: scale(1.07);
	}
	figure:has(.icon:hover) :global(.way svg) {
		clip-path: inset(-50% 0 -50% 0);
	}
	.ink {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.fine {
		stroke-width: 0.9;
	}
	figcaption {
		font: italic 0.98rem var(--display);
		color: var(--ink-faint);
		max-width: 15rem;
	}
	.busy {
		margin: 0;
		font: italic 1.05rem var(--display);
		color: var(--ink-faint);
		text-align: center;
	}
	.error {
		color: var(--madder);
	}
</style>
