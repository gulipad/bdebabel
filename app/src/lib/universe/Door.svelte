<script lang="ts">
	/**
	 * What door.svelte.ts shows: on a phone or a tablet, the popup that says what the model weighs and waits to be
	 * asked. On a desktop nothing, unless the model couldn't come: its download is part of the first search's (or
	 * page's) wait, which they show themselves.
	 */
	import { explain, lang } from '#lib/i18n.ts';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { modelMB } from './client.ts';
	import { door } from './door.svelte.ts';

	const mb = (n: number) => (n / 1e6).toFixed(0);
	const downloading = $derived(door.progress.stage === 'model' && door.progress.total > 0);

	const TEXT = {
		es: {
			arriving: 'Llega el Bibliotecario:',
			of: 'de',
			title: 'El Bibliotecario',
			writes:
				'Cada página de esta biblioteca la escribe en tu navegador un modelo de lenguaje, el Bibliotecario.',
			// (what follows why it is needed: in English a comma)
			then: '',
			weighs: 'hay que descargarlo una vez: pesa',
			mobile: 'Si estás con datos móviles, quizá prefieras esperar a tener wifi.',
			failed: 'No se pudo descargar:',
			notNow: 'Ahora no',
			retry: 'Volver a intentarlo',
			download: 'Descargar',
			checking: 'Comprobando que es el de siempre…',
			calling: 'Llamando al Bibliotecario…',
			closed: 'No se pudo abrir la ciudad:'
		},
		en: {
			arriving: 'The Librarian is coming:',
			of: 'of',
			title: 'The Librarian',
			writes:
				'Every page of this library is written in your browser by a language model, the Librarian.',
			then: ',',
			weighs: 'it has to be downloaded once: it weighs',
			mobile: 'If you are on mobile data, you may prefer to wait until you have wifi.',
			failed: 'It could not be downloaded:',
			notNow: 'Not now',
			retry: 'Try again',
			download: 'Download',
			checking: 'Checking that it is the same as ever…',
			calling: 'Calling the Librarian…',
			closed: 'The city could not be opened:'
		}
	};
	const t = $derived(TEXT[lang()]);
</script>

{#snippet arriving()}
	{t.arriving}
	{mb(door.progress.loaded)}
	{t.of}
	{mb(door.progress.total)} MB
	<span class="bar" style:--done={door.progress.loaded / door.progress.total}></span>
{/snippet}

{#if door.popup !== 'closed'}
	<div class="veil">
		<div class="popup" role="dialog" aria-modal="true" aria-labelledby="door-title">
			<h2 id="door-title">{t.title}</h2>
			<p>
				{t.writes}
				{door.why}{t.then}
				{t.weighs}
				{modelMB()} MB.
			</p>
			<p class="aside">{t.mobile}</p>
			{#if door.popup === 'ask'}
				{#if door.error}<p class="error" role="alert">{t.failed} {explain(door.error)}</p>{/if}
				<div class="row">
					<InkLink small onclick={() => door.notNow()}>{t.notNow}</InkLink>
					<InkLink onclick={() => door.come()}>{door.error ? t.retry : t.download}</InkLink>
				</div>
			{:else}
				<p class="status" role="status">
					{#if downloading}
						{@render arriving()}
					{:else if door.progress.stage === 'verify' || door.progress.stage === 'ready'}
						{t.checking}
					{:else}
						{t.calling}
					{/if}
				</p>
			{/if}
		</div>
	</div>
	<!-- (a universe not there yet is said by the places that need it, not on every page) -->
{:else if door.error && !door.absent}
	<p class="error" role="alert">{t.closed} {door.error}</p>
{/if}

<style>
	.veil {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		justify-content: center;
		padding-left: max(16px, env(safe-area-inset-left, 0px));
		padding-right: max(16px, env(safe-area-inset-right, 0px));
		background: rgba(239, 224, 191, 0.72);
		backdrop-filter: blur(2px);
	}
	.popup {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		width: 100%;
		max-width: 26rem;
		box-sizing: border-box;
		padding: 1.6rem 1.4rem 1.3rem;
		background: rgba(251, 247, 238, 0.97);
		border: 1px solid var(--rule);
		box-shadow: 0 18px 40px -24px rgba(0, 0, 0, 0.45);
	}
	h2 {
		margin: 0;
		font: 400 1.35rem var(--display-sc);
		letter-spacing: 0.14em;
		color: var(--ink);
	}
	p {
		margin: 0;
		font-size: 1.08rem;
		line-height: 1.55;
		color: var(--ink);
	}
	.aside {
		font: italic 1.02rem var(--display);
		color: var(--ink-dry);
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-top: 0.4rem;
	}
	.error {
		color: var(--madder);
		font: italic 1.02rem var(--display);
	}
	.status {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font: italic 1.02rem var(--display);
		color: var(--ink-faint);
		min-width: 12rem;
	}
	.bar {
		display: block;
		height: 2px;
		background: linear-gradient(
			90deg,
			var(--ink-dry) calc(var(--done) * 100%),
			var(--rule) calc(var(--done) * 100%)
		);
	}
</style>
