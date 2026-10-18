<script lang="ts">
	/** One page, at its address; with the way back to its room, and the pages either side of it in its book. */
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page as route } from '$app/state';
	import { addressIn, brief, locate, PAGES, seed } from '#lib/address.ts';
	import Page from '#lib/components/Page.svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
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

	const room = $derived(where ? resolve('/sala/[hexagon]', { hexagon: where.hexagon }) : '');
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

{#if where}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- room is resolved, then given a query -->
	<nav class="trail" aria-label="Dónde está">
		<a href={room}>Sala {brief(where.hexagon)}</a><span>›</span>
		<a href={`${room}?muro=${where.wall}`}>Muro {where.wall}</a><span>›</span>
		<a href={`${room}?muro=${where.wall}&balda=${where.shelf}&volumen=${where.volume}`}
			>Balda {where.shelf} · volumen {where.volume}</a
		>
	</nav>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{/if}

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if result}
	<Page page={result} />
{:else}
	<p class="writing" role="status">El bibliotecario está escribiendo la página…</p>
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
	.trail {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 0.55rem;
		font: italic 0.98rem var(--display);
		color: var(--ink-faint);
		margin-bottom: 1.2rem;
	}
	.trail a {
		color: var(--ink-dry);
	}
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
