<script lang="ts">
	/**
	 * One page, at its address; with the way back to its room, and the pages either side of it in its book.
	 * The same page in both languages (/<address>, /en/<address>): an address of the other language's universe
	 * is taken there, since only that universe can open it.
	 */
	import { goto } from '$app/navigation';
	import { page as route } from '$app/state';
	import { addressIn, locate, PAGES, seed } from '#lib/address.ts';
	import Page from '#lib/components/Page.svelte';
	import { COMMON, explain, KEYS, lang, pagePath } from '#lib/i18n.ts';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { melt } from '#lib/ui/melt.ts';
	import { langOfUniverse, universe } from '#lib/universe/client.ts';
	import type { PageResult } from '#lib/universe/protocol.ts';

	const TEXT = {
		es: {
			shapeless: 'Esto no tiene forma de dirección: universo:hexágono:muro:balda:volumen:página.',
			writing: 'El Bibliotecario está escribiendo la página…',
			choosing: 'Escogiendo…',
			another: 'Otra página al azar'
		},
		en: {
			shapeless: "This isn't shaped like an address: universe:hexagon:wall:shelf:volume:page.",
			writing: 'The Librarian is writing the page…',
			choosing: 'Choosing…',
			another: 'Another page at random'
		}
	};
	const l = lang();
	const t = TEXT[l],
		c = COMMON[l];

	const address = $derived(route.params.address ?? '');
	const where = $derived(locate(address));
	let result = $state<PageResult | null>(null);
	let error = $state(''),
		busy = $state(false);

	$effect(() => {
		const a = address;
		result = null;
		error = '';
		const at = locate(a);
		if (!at) {
			error = t.shapeless;
			return;
		}
		const its = langOfUniverse(at.universe);
		if (its && its !== l) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- pagePath() resolves the route
			goto(pagePath(a, its) + route.url.search, { replace: true });
			return;
		}
		universe(l)
			.open(a)
			.then((p) => {
				if (a === address) result = p;
			})
			.catch((e: Error) => (error = explain(e, l)));
	});

	/** a sentence the link asks to mark (?frase=), where the page has it */
	const phrase = $derived(route.url.searchParams.get(KEYS[l].phrase) ?? '');
	const mark = $derived.by(() => {
		if (!result || !phrase) return undefined;
		const i = result.text.indexOf(phrase);
		const j = i >= 0 ? i : result.text.toLowerCase().indexOf(phrase.toLowerCase());
		return j >= 0 ? { offset: j, length: phrase.length } : undefined;
	});
	const turn = (d: number) =>
		where
			? pagePath(
					addressIn(
						where.universe,
						where.hexagon,
						where.wall,
						where.shelf,
						where.volume,
						where.page + d
					),
					l
				)
			: '';

	async function another() {
		busy = true;
		const p = await universe(l).random(seed());
		busy = false;
		await goto(pagePath(p.address, l));
	}
</script>

<svelte:head
	><title>{where ? `${c.page} ${where.page} · ${c.library}` : c.library}</title></svelte:head
>

{#if error}
	<p class="error" role="alert">{error}</p>
{:else if result}
	<!-- the page melts in once it is written, as everything does -->
	<div use:melt={{ ms: 1100 }}><Page page={result} highlight={mark} /></div>
{:else}
	<p class="writing" role="status">{t.writing}</p>
{/if}

{#if where && !error}
	<div class="turns">
		{#if where.page > 1}<InkLink small href={turn(-1)}>‹ {c.page} {where.page - 1}</InkLink
			>{:else}<span></span>{/if}
		<InkLink small onclick={another}>{busy ? t.choosing : t.another}</InkLink>
		{#if where.page < PAGES}<InkLink small href={turn(1)}>{c.page} {where.page + 1} ›</InkLink
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
