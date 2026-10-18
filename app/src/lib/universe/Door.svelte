<script lang="ts">
	/**
	 * What door.svelte.ts shows: on a desktop, a line while the model arrives (or why it couldn't); on a phone
	 * or a tablet, the popup that says what it weighs and waits to be asked.
	 */
	import InkLink from '#lib/ui/InkLink.svelte';
	import { door } from './door.svelte.ts';

	const mb = (n: number) => (n / 1e6).toFixed(0);
	const downloading = $derived(door.progress.stage === 'model' && door.progress.total > 0);
</script>

{#snippet arriving()}
	Llega el Bibliotecario: {mb(door.progress.loaded)} de {mb(door.progress.total)} MB
	<span class="bar" style:--done={door.progress.loaded / door.progress.total}></span>
{/snippet}

{#if door.popup !== 'closed'}
	<div class="veil">
		<div class="popup" role="dialog" aria-modal="true" aria-labelledby="door-title">
			<h2 id="door-title">El Bibliotecario</h2>
			<p>
				Cada página de esta biblioteca la escribe en tu navegador un modelo de lenguaje, el
				Bibliotecario. {door.why} hay que descargarlo una vez: pesa 77 MB.
			</p>
			<p class="aside">Si estás con datos móviles, quizá prefieras esperar a tener wifi.</p>
			{#if door.popup === 'ask'}
				{#if door.error}<p class="error" role="alert">No se pudo descargar: {door.error}</p>{/if}
				<div class="row">
					<InkLink small onclick={() => door.notNow()}>Ahora no</InkLink>
					<InkLink onclick={() => door.come()}
						>{door.error ? 'Volver a intentarlo' : 'Descargar'}</InkLink
					>
				</div>
			{:else}
				<p class="status" role="status">
					{#if downloading}
						{@render arriving()}
					{:else if door.progress.stage === 'verify' || door.progress.stage === 'ready'}
						Comprobando que es el de siempre…
					{:else}
						Llamando al Bibliotecario…
					{/if}
				</p>
			{/if}
		</div>
	</div>
{:else if door.error}
	<p class="error" role="alert">No se pudo abrir la ciudad: {door.error}</p>
{:else if downloading}
	<p class="status" role="status">{@render arriving()}</p>
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
