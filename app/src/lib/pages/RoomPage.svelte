<script lang="ts">
	/**
	 * A room: chosen at random from Ir, or reached from a page. From above you choose a wall; face on, a
	 * book on one of its shelves; open, a page. Each choice is kept in the address bar, so going back undoes it.
	 * The same page in both languages (/sala/…, /en/room/…), each in its own universe, with its own query's words.
	 */
	import { tick } from 'svelte';
	import { afterNavigate, goto } from '$app/navigation';
	import { page as route } from '$app/state';
	import { addressIn, brief, PAGES, seed, SHELVES, VOLUMES, WALLS } from '#lib/address.ts';
	import Book from '#lib/browse/Book.svelte';
	import { roomLink } from '#lib/browse/links.ts';
	import Room from '#lib/browse/Room.svelte';
	import Wall from '#lib/browse/Wall.svelte';
	import { COMMON, explain, KEYS, lang, pagePath, roomPath } from '#lib/i18n.ts';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { universe } from '#lib/universe/client.ts';

	const TEXT = {
		es: {
			atWall: (w: number) => `Estás en el muro ${w}. Puedes escoger otro.`,
			chooseWall: 'Escoge un muro.',
			books: (n: number) => `Cinco baldas, ${n} libros.`,
			chosen: (v: number, s: number) => `Has escogido el volumen ${v} de la balda ${s}.`,
			chooseOne: 'Escoge uno.',
			pages: (n: number) => `${n} páginas. Escoge una.`
		},
		en: {
			atWall: (w: number) => `You are at wall ${w}. You can choose another.`,
			chooseWall: 'Choose a wall.',
			books: (n: number) => `Five shelves, ${n} books.`,
			chosen: (v: number, s: number) => `You have chosen volume ${v} on shelf ${s}.`,
			chooseOne: 'Choose one.',
			pages: (n: number) => `${n} pages. Choose one.`
		}
	};
	const l = lang();
	const t = TEXT[l],
		c = COMMON[l],
		keys = KEYS[l];

	const hexagon = $derived(route.params.hexagon ?? '');
	const int = (k: string, max: number) => {
		const n = Number(route.url.searchParams.get(k));
		return Number.isInteger(n) && n >= 1 && n <= max ? n : 0;
	};
	const wall = $derived(int(keys.wall, WALLS)),
		shelf = $derived(int(keys.shelf, SHELVES)),
		volume = $derived(int(keys.volume, VOLUMES));
	let page = $state(1);

	let steps = $state<HTMLElement>();
	async function choose(at: { wall: number; shelf?: number; volume?: number }) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- roomLink() resolves the route, then adds the query
		await goto(roomLink(hexagon, at, l), { reset: false });
	}
	/** the universe couldn't be opened (one not published yet, say): said here, as the room can't be entered */
	let error = $state('');
	universe(l).ready.catch((e: Error) => (error = explain(e, l)));
	// after any arrival (a choice here, or a link from a page to its wall, shelf, book or page), the deepest
	// step chosen comes into view
	afterNavigate(async () => {
		await tick();
		if (wall) steps?.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	});
	async function open(p: number) {
		const u = await universe(l).ready;
		await goto(pagePath(addressIn(u.id, hexagon, wall, shelf, volume, p), l));
	}
	/** out through a hallway: into another room */
	async function walk() {
		const r = await universe(l).room(seed());
		await goto(roomPath(r.hexagon, l));
	}
	let copied = $state(false);
	/** the room's link, to come back to it or give it to someone */
	async function copy() {
		const link = location.origin + roomPath(hexagon, l);
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
		page = int(keys.page, PAGES) || 1;
	});
</script>

<svelte:head><title>{c.room} {brief(hexagon, 4)} · {c.library}</title></svelte:head>

<section class="sala">
	<header>
		<h1>{c.room} <span class="name">{brief(hexagon)}</span></h1>
		<InkLink small onclick={copy}>{copied ? c.copied : c.copy}</InkLink>
	</header>
	{#if error}<p class="error" role="alert">{error}</p>{/if}

	<div class="steps" bind:this={steps}>
		<div class="step">
			<p class="ask">
				{wall ? t.atWall(wall) : t.chooseWall}
			</p>
			<Room current={wall} onpick={(w) => choose({ wall: w })} onhall={walk} />
		</div>

		{#if wall}
			{#key wall}
				<div class="step" use:melt={{ ms: 900 }}>
					<h2>{c.wall} {wall}</h2>
					<p class="ask">
						{t.books(SHELVES * VOLUMES)}
						{volume ? t.chosen(volume, shelf) : t.chooseOne}
					</p>
					<Wall
						seed={`${hexagon}:${wall}`}
						current={shelf ? { shelf, volume } : undefined}
						onpick={(s, v) => choose({ wall, shelf: s, volume: v })}
					/>
				</div>
			{/key}
		{/if}

		{#if wall && shelf && volume}
			{#key `${shelf}:${volume}`}
				<div class="step" use:melt={{ ms: 900 }}>
					<h2>{c.shelf} {shelf} · {c.volume} {volume}</h2>
					<p class="ask">{t.pages(PAGES)}</p>
					<Book {volume} bind:page onopen={open} />
				</div>
			{/key}
		{/if}
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
	.error {
		margin: 0;
		color: var(--madder);
	}
	.ask {
		margin: 0;
		font: italic 1.1rem var(--display);
		color: var(--ink-dry);
	}
</style>
