<script lang="ts">
	/**
	 * A room: chosen at random from Ir, or reached from a page. From above you choose a wall; face on, a
	 * book on one of its shelves; open, a page. Each choice is kept in the address bar, so going back undoes it.
	 */
	import { tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
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
	}
	// after any arrival (a choice here, or a link from a page to its wall, shelf, book or page), the deepest
	// step chosen comes into view
	afterNavigate(async () => {
		await tick();
		if (wall) steps?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
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
	/** the room's link, to come back to it or give it to someone */
	async function copy() {
		const link = location.origin + resolve('/sala/[hexagon]', { hexagon });
		try {
			await navigator.clipboard.writeText(link);
		} catch {
			const t = Object.assign(document.createElement('textarea'), { value: link });
			document.body.append(t);
			t.select();
			document.execCommand('copy');
			t.remove();
		}
		copied = true;
		setTimeout(() => (copied = false), 2200);
	}
	// a book opens at the page asked for (?pagina=), or at its first
	$effect(() => {
		void volume;
		page = int('pagina', PAGES) || 1;
	});
</script>

<svelte:head><title>Sala {brief(hexagon, 4)} · La Biblioteca de Babel</title></svelte:head>

<section class="sala">
	<header>
		<h1>Sala <span class="name">{brief(hexagon)}</span></h1>
		<InkLink small onclick={copy}>{copied ? 'Copiado' : 'Copiar el enlace'}</InkLink>
	</header>

	<div class="steps" bind:this={steps}>
		<div class="step">
			<p class="ask">
				{wall ? `Estás en el muro ${wall}. Puedes escoger otro.` : 'Escoge un muro.'}
			</p>
			<Room current={wall} onpick={(w) => choose({ muro: w })} onhall={walk} />
		</div>

		{#if wall}
			{#key wall}
				<div class="step" use:melt={{ ms: 900 }}>
					<h2>Muro {wall}</h2>
					<p class="ask">
						Cinco baldas, {SHELVES * VOLUMES} libros. {volume
							? `Has escogido el volumen ${volume} de la balda ${shelf}.`
							: 'Escoge uno.'}
					</p>
					<Wall
						seed={`${hexagon}:${wall}`}
						current={shelf ? { shelf, volume } : undefined}
						onpick={(s, v) => choose({ muro: wall, balda: s, volumen: v })}
					/>
				</div>
			{/key}
		{/if}

		{#if wall && shelf && volume}
			{#key `${shelf}:${volume}`}
				<div class="step" use:melt={{ ms: 900 }}>
					<h2>Balda {shelf} · Volumen {volume}</h2>
					<p class="ask">{PAGES} páginas. Escoge una.</p>
					<Book {volume} bind:page onopen={open} />
				</div>
			{/key}
		{/if}
	</div>

	<div class="elsewhere">
		<InkLink small href={resolve('/ir')}>Ir a otro sitio</InkLink>
	</div>
</section>

<style>
	.sala {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}
	.name {
		font: italic 400 1.5rem var(--display);
		letter-spacing: 0.02em;
		color: var(--ink-dry);
		margin-left: 0.3rem;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.4rem 1rem;
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
