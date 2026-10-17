<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as route } from '$app/state';
	import { locate, seed } from '#lib/address.ts';
	import Page from '#lib/components/Page.svelte';
	import { universe } from '#lib/universe/client.ts';
	import type { PageResult } from '#lib/universe/protocol.ts';

	const address = $derived(route.params.address ?? '');
	let result = $state<PageResult | null>(null);
	let error = $state('');

	$effect(() => {
		const a = address;
		result = null;
		error = '';
		if (!locate(a)) {
			error = 'Esto no tiene forma de dirección: universo:hexágono:muro:anaquel:volumen:página.';
			return;
		}
		universe()
			.open(a)
			.then((p) => {
				if (a === address) result = p;
			})
			.catch((e: Error) => (error = e.message));
	});

	async function another() {
		const p = await universe().random(seed());
		await goto(resolve('/[address]', { address: p.address }));
	}
</script>

<svelte:head
	><title
		>{result
			? `Página ${locate(result.address)?.page} · La Ciudad de Babel`
			: 'La Ciudad de Babel'}</title
	></svelte:head
>

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if result}
	<Page page={result} />
	<div class="next"><button type="button" onclick={another}>Otra página al azar</button></div>
{:else}
	<p class="writing" role="status">Escribiendo la página…</p>
{/if}

<style>
	.error {
		color: var(--madder);
	}
	.writing {
		font-style: italic;
		color: var(--ink-faint);
	}
	.next {
		display: flex;
		justify-content: center;
	}
</style>
