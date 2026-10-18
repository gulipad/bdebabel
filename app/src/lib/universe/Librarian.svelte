<script lang="ts">
	/**
	 * The door to the places that need the model (Buscar, a room, a page, Ir's chance): the first time, it says
	 * what the Bibliotecario weighs and waits to be asked; then it shows the download, and opens once the
	 * model is in and checked. When the model came on an earlier visit, the door is already open.
	 */
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { handheld } from '#lib/ui/device.ts';
	import { melt } from '#lib/ui/melt.ts';
	import { arrived, universe, type Progress } from './client.ts';

	let { children, why = 'Para buscar y abrir páginas' }: { children: Snippet; why?: string } =
		$props();

	let door = $state<'checking' | 'ask' | 'coming' | 'in'>('checking');
	let progress = $state<Progress>({ stage: 'manifest', loaded: 0, total: 0 });
	let error = $state('');

	function come() {
		door = 'coming';
		error = '';
		const u = universe();
		const off = u.onProgress((p) => (progress = p));
		u.ready
			.then(() => (door = 'in'))
			.catch((e: Error) => {
				error = e.message;
				door = 'ask';
			})
			.finally(off);
	}

	onMount(async () => {
		if (await arrived()) {
			// already here, or in the cache: the pages say themselves that they are being written
			universe();
			door = 'in';
		} else door = 'ask';
	});

	const mb = (n: number) => (n / 1e6).toFixed(0);
	const phone = handheld();
</script>

{#if door === 'in'}
	{@render children()}
{:else if door !== 'checking'}
	<section class="door" use:melt={{ ms: 700 }}>
		<h2>El Bibliotecario</h2>
		<p>
			Cada página de esta biblioteca la escribe en tu navegador un modelo de lenguaje, el
			Bibliotecario. {why} hay que descargarlo una vez: pesa 77 MB.
		</p>
		{#if phone}
			<p class="aside">Si estás con datos móviles, quizá prefieras esperar a tener wifi.</p>
		{/if}
		{#if door === 'ask'}
			{#if error}<p class="error" role="alert">No se pudo descargar: {error}</p>{/if}
			<div class="row">
				<InkLink onclick={come}
					>{error ? 'Volver a intentarlo' : 'Descargar el Bibliotecario'}</InkLink
				>
			</div>
		{:else}
			<p class="status" role="status">
				{#if progress.stage === 'model' && progress.total}
					Llega el Bibliotecario: {mb(progress.loaded)} de {mb(progress.total)} MB
					<span class="bar" style:--done={progress.loaded / progress.total}></span>
				{:else if progress.stage === 'verify' || progress.stage === 'ready'}
					Comprobando que es el de siempre…
				{:else}
					Llamando al Bibliotecario…
				{/if}
			</p>
		{/if}
	</section>
{/if}

<style>
	.door {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		max-width: 34rem;
		margin: 0.6rem 0 0;
	}
	h2 {
		margin: 0;
		font: 400 1.6rem var(--display-sc);
		letter-spacing: 0.14em;
		color: var(--ink);
	}
	p {
		margin: 0;
		font-size: 1.12rem;
		line-height: 1.55;
		color: var(--ink);
	}
	.aside {
		font: italic 1.05rem var(--display);
		color: var(--ink-dry);
	}
	.row {
		display: flex;
		justify-content: flex-end;
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
		font: italic 1.05rem var(--display);
		color: var(--ink-faint);
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
