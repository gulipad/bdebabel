<script lang="ts">
	/**
	 * Buscar: a sentence, and the page where it was already written: the page the Library itself would write
	 * around it, at its ordinary address among all the others. The query lives in the address bar (?q=).
	 */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as route } from '$app/state';
	import { brief, locate, steps } from '#lib/address.ts';
	import Page from '#lib/components/Page.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { universe } from '#lib/universe/client.ts';
	import type { SearchPage } from '#lib/universe/protocol.ts';

	const query = $derived(route.url.searchParams.get('q') ?? '');
	/**
	 * which result for this phrase (0: the first). The search's seed is this number, so a phrase always gives
	 * the same first page, on any device, and the same second, third…: the universe's own fixtures search
	 * with seed '0'
	 */
	const nth = $derived(Math.max(0, Math.floor(Number(route.url.searchParams.get('n')) || 0)));
	// the sentence being written, starting from the one searched
	let draft = $derived(query);
	let result = $state<SearchPage | null>(null),
		error = $state(''),
		since = $state(0),
		now = $state(0);

	const EXAMPLES = [
		'te quiero',
		'no lo sé',
		'mañana es tu cumpleaños',
		'tenía miedo de la oscuridad'
	];

	$effect(() => {
		const q = query,
			n = nth;
		result = null;
		error = '';
		if (!q) return;
		since = performance.now();
		universe()
			.search(q, String(n))
			.then((p) => {
				if (q === query && n === nth) result = p;
			})
			.catch((e: Error) => (error = e.message));
	});
	// the seconds the search has taken, while it takes them
	$effect(() => {
		if (!query || result || error) return;
		const t = setInterval(() => (now = performance.now()), 250);
		return () => clearInterval(t);
	});

	/**
	 * An address, or a link to a page, pasted in: opened if it has the shape of one. The address doesn't
	 * remember the sentence that was searched (it is an ordinary page), but a link can carry it (?frase=),
	 * and so can the field under the address: the page then marks it where it appears.
	 */
	let where2 = $state(''),
		phrase = $state(''),
		bad = $state('');
	function openAddress() {
		let a = where2.trim(),
			f = phrase.trim();
		const q = a.indexOf('?');
		if (q >= 0) {
			f ||= new URLSearchParams(a.slice(q + 1)).get('frase') ?? '';
			a = a.slice(0, q);
		}
		try {
			a = decodeURIComponent(a);
		} catch {
			/* not encoded */
		}
		a = a.replace(/\s+/g, '').replace(/^.*\/(?=[^/]+$)/, '');
		if (!locate(a)) {
			bad = 'Esto no tiene forma de dirección: universo:hexágono:muro:balda:volumen:página.';
			return;
		}
		bad = '';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- withPhrase() resolves the route
		goto(withPhrase(a, f));
	}
	/** a page's link, with the sentence to mark in it */
	const withPhrase = (address: string, f: string) =>
		resolve('/[address]', { address }) + (f ? `?${new URLSearchParams({ frase: f })}` : '');
	let linked = $state(false);
	async function copyLink() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(
				location.origin + withPhrase(result.address, result.query)
			);
			linked = true;
			setTimeout(() => (linked = false), 2200);
		} catch {
			linked = false;
		}
	}

	function search(q = draft, n = 0) {
		const text = q.trim();
		if (!text || (text === query && n === nth)) return;
		const params = new URLSearchParams(n ? { q: text, n: String(n) } : { q: text });
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the route is resolved, then given its query
		goto(`${resolve('/buscar')}?${params}`);
	}
	const where = $derived(result ? locate(result.address) : null);
</script>

<svelte:head><title>{query ? `«${query}»` : 'Buscar'} · La Biblioteca de Babel</title></svelte:head>

<section class="buscar">
	<h1>Buscar</h1>
	<p class="lede">
		Escribe una frase. En alguna balda ya está escrita: el bibliotecario busca la página que la
		Biblioteca habría escrito alrededor de tus palabras, y te lleva hasta ella.
	</p>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			search();
		}}
	>
		<label class="field">
			<span class="sr">Tu frase</span>
			<textarea
				bind:value={draft}
				rows="2"
				maxlength="600"
				placeholder="«Tenía miedo de la oscuridad»"
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						search();
					}
				}}></textarea>
			<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
				<path d="M1 6 C 20 4.4, 44 7.2, 64 5.4 S 90 4.6, 99 5.6" />
			</svg>
		</label>
		<div class="row">
			<InkLink onclick={() => search()}>Buscar en la Biblioteca</InkLink>
		</div>
		{#if !query}
			<p class="examples">
				O prueba:
				{#each EXAMPLES as ex (ex)}
					<button type="button" class="example" onclick={() => search(ex)}>{ex}</button>
				{/each}
			</p>
		{/if}
	</form>

	{#if error}
		<p class="error" role="alert">{error}</p>
	{:else if result}
		<div class="found" use:melt={{ ms: 1000 }}>
			{#if result.removed}
				<p class="notice">
					La Biblioteca no tiene estos caracteres y se han quitado de la búsqueda: <b
						>{result.removed}</b
					>
				</p>
			{/if}
			{#if nth}<p class="nth">Página nº {nth + 1} con esta frase</p>{/if}
			<p class="distance">
				Tu frase está a <b>{steps(result.bits)}</b> pasos del centro, en <i>{result.ring}</i>.
			</p>
			{#if where}
				<nav class="trail" aria-label="Dónde está">
					<a href={resolve('/sala/[hexagon]', { hexagon: where.hexagon })}
						>Sala {brief(where.hexagon)}</a
					><span>›</span><span>Muro {where.wall}</span><span>›</span><span
						>Balda {where.shelf} · volumen {where.volume} · página {where.page}</span
					>
				</nav>
			{/if}
			<Page page={result} highlight={{ offset: result.offset, length: result.query.length }} />
			<div class="again">
				{#if nth}
					<InkLink small onclick={() => search(query, 0)}>‹ La primera</InkLink>
				{/if}
				<InkLink small onclick={() => search(query, nth + 1)}>Otra página con esta frase</InkLink>
				<InkLink small onclick={copyLink}
					>{linked ? 'Enlace copiado' : 'Copiar el enlace con la frase'}</InkLink
				>
				<InkLink small href={withPhrase(result.address, result.query)}>Abrir la página</InkLink>
			</div>
		</div>
	{:else if query}
		<div class="searching" role="status">
			<svg viewBox="0 0 120 120" aria-hidden="true">
				{#each [0, 1, 2, 3, 4, 5] as k (k)}
					<line
						class="seek"
						style:animation-delay="{k * 0.25}s"
						x1={60 + 40 * Math.cos((Math.PI / 3) * k)}
						y1={60 + 40 * Math.sin((Math.PI / 3) * k)}
						x2={60 + 40 * Math.cos((Math.PI / 3) * (k + 1))}
						y2={60 + 40 * Math.sin((Math.PI / 3) * (k + 1))}
						pathLength="1"
					/>
				{/each}
			</svg>
			<p>
				El bibliotecario recorre las salas buscando «{query}»…
				{#if now - since > 1500}<span class="secs">{Math.round((now - since) / 1000)} s</span>{/if}
			</p>
		</div>
	{/if}

	<form
		class="address"
		onsubmit={(e) => {
			e.preventDefault();
			openAddress();
		}}
	>
		<h2>Ir a una dirección</h2>
		<p class="hint">
			Si alguien te ha dado una dirección (o el enlace a una página), pégala aquí y el bibliotecario
			te lleva hasta ella.
		</p>
		<label class="field">
			<span class="sr">Dirección</span>
			<textarea
				class="mono"
				bind:value={where2}
				rows="3"
				spellcheck="false"
				placeholder="babel-1:hexágono:muro:balda:volumen:página"
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						openAddress();
					}
				}}></textarea>
			<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
				<path d="M1 5.6 C 24 4.2, 46 7, 66 5.2 S 90 4.8, 99 5.4" />
			</svg>
		</label>
		<label class="field">
			<span class="sr">Frase que resaltar</span>
			<input
				class="phrase"
				bind:value={phrase}
				placeholder="Y, si quieres, la frase que buscabas, para resaltarla"
			/>
			<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
				<path d="M1 5.4 C 30 4.6, 50 6.6, 70 5.2 S 92 5, 99 5.6" />
			</svg>
		</label>
		{#if bad}<p class="error" role="alert">{bad}</p>{/if}
		<div class="row">
			<InkLink onclick={openAddress}>Abrir la página</InkLink>
		</div>
	</form>
</section>

<style>
	.buscar {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
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
	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.field {
		position: relative;
		display: block;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	textarea {
		display: block;
		width: 100%;
		resize: none;
		border: 0;
		background: none;
		font: italic 1.6rem/1.35 var(--display);
		color: var(--ink);
		padding: 0.3rem 0 0.5rem;
		outline: none;
	}
	textarea::placeholder {
		color: var(--ink-faint);
		opacity: 0.7;
	}
	/* a ruled line under the sentence, inked darker when you write */
	.field svg {
		display: block;
		width: 100%;
		height: 0.6rem;
		overflow: visible;
	}
	.field path {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 1.2px;
		vector-effect: non-scaling-stroke;
		opacity: 0.55;
		transition:
			opacity 0.3s,
			stroke-width 0.3s;
	}
	.field:focus-within path {
		opacity: 1;
		stroke-width: 1.8px;
	}
	.row {
		display: flex;
		justify-content: flex-end;
	}
	.examples {
		margin: 0;
		font: italic 1rem var(--display);
		color: var(--ink-faint);
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.7rem;
	}
	.example {
		font: italic 1rem var(--display);
		letter-spacing: 0;
		color: var(--ink-dry);
		background: none;
		border: 0;
		padding: 0;
		text-decoration: underline;
		text-decoration-color: var(--rule);
		text-underline-offset: 0.2em;
	}
	.example:hover {
		background: none;
		color: var(--madder);
	}
	.found {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.distance {
		margin: 0;
		font: italic 1.25rem var(--display);
		color: var(--ink-dry);
	}
	.distance b {
		font-style: normal;
		font-weight: 400;
		color: var(--ink);
	}
	.nth {
		margin: 0;
		font: 0.95rem var(--display-sc);
		letter-spacing: 0.12em;
		color: var(--ink-faint);
	}
	.notice {
		margin: 0;
		font: italic 1rem var(--display);
		color: var(--ink-faint);
	}
	.notice b {
		font-style: normal;
		color: var(--ink);
	}
	.trail {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.55rem;
		font: italic 0.98rem var(--display);
		color: var(--ink-faint);
	}
	.trail a {
		color: var(--ink-dry);
	}
	.again {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.8rem;
	}
	.searching {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		padding: 2rem 0;
		text-align: center;
	}
	.searching svg {
		width: 5rem;
		height: 5rem;
	}
	.searching p {
		margin: 0;
		font: italic 1.1rem var(--display);
		color: var(--ink-faint);
		max-width: 28rem;
	}
	.secs {
		font: 0.8rem var(--mono);
		margin-left: 0.4rem;
	}
	/* the six walls drawn and undrawn in turn, as if walking from room to room */
	.seek {
		stroke: var(--sepia);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: seek 1.5s ease-in-out infinite;
	}
	@keyframes seek {
		0% {
			stroke-dashoffset: 1;
		}
		40%,
		60% {
			stroke-dashoffset: 0;
		}
		100% {
			stroke-dashoffset: -1;
		}
	}
	.error {
		color: var(--madder);
	}
	.address {
		margin-top: 1.4rem;
		padding-top: 1.6rem;
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
	.phrase {
		display: block;
		width: 100%;
		border: 0;
		background: none;
		font: italic 1.15rem var(--display);
		color: var(--ink);
		padding: 0.3rem 0;
		outline: none;
	}
	.phrase::placeholder {
		color: var(--ink-faint);
		opacity: 0.7;
	}
	textarea.mono {
		font: 0.85rem/1.5 var(--mono);
		word-break: break-all;
	}
</style>
