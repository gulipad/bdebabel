<script lang="ts">
	/** Hojear: let chance choose a page, or a room to walk into and choose for yourself; or go to the centre. */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { seed } from '#lib/address.ts';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { universe } from '#lib/universe/client.ts';

	let busy = $state(''),
		error = $state('');

	async function go(what: 'page' | 'room' | 'centre') {
		if (busy) return;
		error = '';
		busy =
			what === 'room'
				? 'Buscando una sala…'
				: what === 'centre'
					? 'Camino del centro…'
					: 'El bibliotecario escoge una página…';
		try {
			const u = universe();
			if (what === 'room') {
				const r = await u.room(seed());
				await goto(resolve('/sala/[hexagon]', { hexagon: r.hexagon }));
			} else {
				const p = what === 'page' ? await u.random(seed()) : await u.center();
				await goto(resolve('/[address]', { address: p.address }));
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			busy = '';
		}
	}
</script>

<svelte:head><title>Hojear · La Biblioteca de Babel</title></svelte:head>

<section class="hojear">
	<h1>Hojear</h1>
	<p class="lede">
		En la Biblioteca no hay índice. Hay salas, y en cada sala cuatro muros con cinco baldas, 32
		libros por balda y 410 páginas por libro. Puedes dejar que el azar te lleve a una página, o
		entrar en una sala y escoger tú el muro, la balda, el libro y la página.
	</p>

	<div class="ways">
		<figure use:melt={{ delay: 150 }}>
			<svg viewBox="0 0 120 120" aria-hidden="true">
				<path class="ink" d="M34 18 h46 l14 14 v70 h-60 z M80 18 v14 h14" />
				{#each [40, 48, 56, 64, 72, 80, 88] as y (y)}
					<line class="ink fine" x1="42" x2={y % 16 ? 84 : 76} y1={y} y2={y} />
				{/each}
			</svg>
			<InkLink onclick={() => go('page')}>Una página al azar</InkLink>
			<figcaption>Cualquiera de las páginas, con la misma probabilidad con que existen.</figcaption>
		</figure>
		<figure use:melt={{ delay: 300 }}>
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
			<InkLink onclick={() => go('room')}>Una sala al azar</InkLink>
			<figcaption>Entras, miras los muros y eliges un libro.</figcaption>
		</figure>
		<figure use:melt={{ delay: 450 }}>
			<svg viewBox="0 0 120 120" aria-hidden="true">
				{#each [44, 32, 20] as r (r)}
					<circle class="ink" class:fine={r !== 20} cx="60" cy="60" {r} />
				{/each}
				<circle class="dot" cx="60" cy="60" r="3" />
			</svg>
			<InkLink onclick={() => go('centre')}>El Centro</InkLink>
			<figcaption>La página que el bibliotecario espera más que ninguna: a 0 pasos.</figcaption>
		</figure>
	</div>

	{#if busy}<p class="busy" role="status">{busy}</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
	.hojear {
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
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
	.ways {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
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
	svg {
		width: 6.5rem;
		height: 6.5rem;
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
	.dot {
		fill: var(--ink);
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
