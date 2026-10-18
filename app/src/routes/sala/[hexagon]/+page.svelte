<script lang="ts">
	/**
	 * A room: chosen at random from Hojear, or reached from a page. From above you choose a wall; face on, a
	 * book on one of its shelves; open, a page. Each choice is kept in the address bar, so going back undoes it.
	 */
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as route } from '$app/state';
	import { addressIn, brief, PAGES, seed, SHELVES, VOLUMES, WALLS } from '#lib/address.ts';
	import Book from '#lib/browse/Book.svelte';
	import Room from '#lib/browse/Room.svelte';
	import Wall from '#lib/browse/Wall.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { universe } from '#lib/universe/client.ts';

	const hexagon = $derived(route.params.hexagon ?? '');
	const int = (k: string, max: number) => {
		const n = Number(route.url.searchParams.get(k));
		return Number.isInteger(n) && n >= 1 && n <= max ? n : 0;
	};
	const wall = $derived(int('muro', WALLS)),
		shelf = $derived(int('balda', SHELVES)),
		volume = $derived(int('volumen', VOLUMES));
	let page = $state(1);

	const here = (q: Record<string, number>) =>
		`${resolve('/sala/[hexagon]', { hexagon })}?${new URLSearchParams(
			Object.entries(q).map(([k, v]) => [k, String(v)])
		)}`;
	let steps = $state<HTMLElement>();
	async function choose(q: Record<string, number>) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- here() resolves the route, then adds the query
		await goto(here(q), { reset: false });
		await tick();
		steps?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	async function open(p: number) {
		const u = await universe().ready;
		await goto(
			resolve('/[address]', { address: addressIn(u.id, hexagon, wall, shelf, volume, p) })
		);
	}
	/** out through a hallway: into another room */
	async function walk() {
		const r = await universe().room(seed());
		await goto(resolve('/sala/[hexagon]', { hexagon: r.hexagon }));
	}
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(hexagon);
			copied = true;
		} catch {
			copied = false;
		}
	}
	$effect(() => {
		void volume;
		page = 1;
	});
</script>

<svelte:head><title>Sala {brief(hexagon, 4)} · La Biblioteca de Babel</title></svelte:head>

<section class="sala">
	<header>
		<h1>Sala</h1>
		<details>
			<summary
				><span class="name">{brief(hexagon)}</span> · su nombre completo tiene {hexagon.length} caracteres</summary
			>
			<p class="hex">{hexagon}</p>
			<button type="button" class="copy" onclick={copy}>{copied ? 'Copiado' : 'Copiar'}</button>
		</details>
	</header>

	<div class="steps" bind:this={steps}>
		<div class="step">
			<p class="ask">{wall ? 'Has escogido un muro. Puedes cambiarlo.' : 'Escoge un muro.'}</p>
			<Room current={wall} onpick={(w) => choose({ muro: w })} onhall={walk} />
		</div>

		{#if wall}
			{#key wall}
				<div class="step" use:melt={{ ms: 900 }}>
					<h2>Muro {wall}</h2>
					<p class="ask">
						Cinco baldas, {SHELVES * VOLUMES} libros. {volume
							? 'Tienes uno en la mano.'
							: 'Escoge uno.'}
					</p>
					<Wall
						seed={`${hexagon}:${wall}`}
						current={volume ? { shelf, volume } : undefined}
						onpick={(s, v) => choose({ muro: wall, balda: s, volumen: v })}
					/>
				</div>
			{/key}
		{/if}

		{#if wall && shelf && volume}
			{#key `${shelf}:${volume}`}
				<div class="step" use:melt={{ ms: 900 }}>
					<h2>Balda {shelf} · Volumen {volume}</h2>
					<p class="ask">{PAGES} páginas. Hojéalo y escoge una.</p>
					<Book {volume} bind:page onopen={open} />
				</div>
			{/key}
		{/if}
	</div>

	<div class="elsewhere">
		<InkLink small href={resolve('/hojear')}>Otra sala</InkLink>
	</div>
</section>

<style>
	.sala {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}
	.name {
		font: normal 0.9rem var(--mono);
		color: var(--ink-dry);
	}
	header {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	h1,
	h2 {
		margin: 0;
		font: 400 2rem var(--display-sc);
		letter-spacing: 0.14em;
		color: var(--ink);
	}
	h2 {
		font-size: 1.35rem;
	}
	summary {
		cursor: pointer;
		font: italic 0.95rem var(--display);
		color: var(--ink-faint);
	}
	.hex {
		font: 0.72rem/1.55 var(--mono);
		word-break: break-all;
		color: var(--ink-dry);
		max-height: 8em;
		overflow: auto;
		margin: 0.5rem 0;
	}
	.copy {
		font-size: 0.72rem;
		padding: 0.3rem 0.7rem;
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: 3rem;
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		scroll-margin-top: 1.2rem;
	}
	.ask {
		margin: 0;
		font: italic 1.1rem var(--display);
		color: var(--ink-dry);
	}
	.elsewhere {
		display: flex;
		justify-content: center;
	}
</style>
