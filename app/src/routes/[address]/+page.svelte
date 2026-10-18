<script lang="ts">
	/** One page, at its address; with the way back to its room, and the pages either side of it in its book. */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as route } from '$app/state';
	import { addressIn, locate, PAGES, seed } from '#lib/address.ts';
	import Page from '#lib/components/Page.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { universe } from '#lib/universe/client.ts';
	import type { PageResult } from '#lib/universe/protocol.ts';

	const address = $derived(route.params.address ?? '');
	const where = $derived(locate(address));
	let result = $state<PageResult | null>(null);
	let error = $state(''),
		busy = $state(false);

	$effect(() => {
		const a = address;
		result = null;
		error = '';
		if (!locate(a)) {
			error = 'Esto no tiene forma de dirección: universo:hexágono:muro:balda:volumen:página.';
			return;
		}
		universe()
			.open(a)
			.then((p) => {
				if (a === address) result = p;
			})
			.catch((e: Error) => (error = e.message));
	});

	/** a sentence the link asks to mark (?frase=), where the page has it */
	const phrase = $derived(route.url.searchParams.get('frase') ?? '');
	const mark = $derived.by(() => {
		if (!result || !phrase) return undefined;
		const i = result.text.indexOf(phrase);
		const j = i >= 0 ? i : result.text.toLowerCase().indexOf(phrase.toLowerCase());
		return j >= 0 ? { offset: j, length: phrase.length } : undefined;
	});
	const turn = (d: number) =>
		where
			? resolve('/[address]', {
					address: addressIn(
						where.universe,
						where.hexagon,
						where.wall,
						where.shelf,
						where.volume,
						where.page + d
					)
				})
			: '';

	async function another() {
		busy = true;
		const p = await universe().random(seed());
		busy = false;
		await goto(resolve('/[address]', { address: p.address }));
	}
</script>

<svelte:head
	><title
		>{where ? `Página ${where.page} · La Biblioteca de Babel` : 'La Biblioteca de Babel'}</title
	></svelte:head
>

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if result}
	<!-- the page melts in once it is written, as everything does -->
	<div use:melt={{ ms: 1100 }}><Page page={result} highlight={mark} /></div>
{:else}
	<p class="writing" role="status">El Bibliotecario está escribiendo la página…</p>
{/if}

{#if where && !error}
	<div class="turns">
		{#if where.page > 1}<InkLink small href={turn(-1)}>‹ Página {where.page - 1}</InkLink
			>{:else}<span></span>{/if}
		<InkLink small onclick={another}>{busy ? 'Escogiendo…' : 'Otra página al azar'}</InkLink>
		{#if where.page < PAGES}<InkLink small href={turn(1)}>Página {where.page + 1} ›</InkLink
			>{:else}<span></span>{/if}
	</div>
{/if}

<style>
	.error {
		color: var(--madder);
	}
	.writing {
		font: italic 1.1rem var(--display);
		color: var(--ink-faint);
		text-align: center;
		padding: 4rem 0;
	}
	.turns {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 1.4rem;
	}
</style>
