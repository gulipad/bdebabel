<script lang="ts">
	import { page as route } from '$app/state';
	import { seed } from '#lib/address.ts';
	import Page from '#lib/components/Page.svelte';
	import { universe } from '#lib/universe/client.ts';
	import type { SearchPage } from '#lib/universe/protocol.ts';

	const query = $derived(route.url.searchParams.get('q') ?? '');
	let result = $state<SearchPage | null>(null);
	let error = $state('');
	let attempt = $state(0);

	$effect(() => {
		const q = query;
		void attempt;
		result = null;
		error = '';
		if (!q) return;
		universe()
			.search(q, seed())
			.then((p) => {
				if (q === query) result = p;
			})
			.catch((e: Error) => (error = e.message));
	});
</script>

<svelte:head><title>«{query}» · La Ciudad de Babel</title></svelte:head>

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if result}
	{#if result.removed}
		<p class="notice">
			La Biblioteca no tiene estos caracteres y se han quitado de la búsqueda: <b
				>{result.removed}</b
			>
		</p>
	{/if}
	<Page page={result} highlight={{ offset: result.offset, length: result.query.length }} />
	<div class="next">
		<button type="button" onclick={() => attempt++}>Otra página con esta frase</button>
	</div>
{:else if query}
	<p class="writing" role="status">Buscando «{query}» en la Biblioteca…</p>
{/if}

<style>
	.error {
		color: var(--madder);
	}
	.notice,
	.writing {
		font-style: italic;
		color: var(--ink-faint);
		margin: 0;
	}
	.notice b {
		font-style: normal;
		color: var(--ink);
	}
	.next {
		display: flex;
		justify-content: center;
	}
</style>
