<script lang="ts">
	/** How the city is arriving: the manifest, the engine, the 77 MB model (once), then ready. */
	import { onMount } from 'svelte';
	import { universe, type Progress } from '#lib/universe/client.ts';

	let progress = $state<Progress>({ stage: 'manifest', loaded: 0, total: 0 });
	let error = $state('');

	onMount(() => {
		const u = universe();
		const off = u.onProgress((p) => (progress = p));
		u.ready.catch((e: Error) => (error = e.message));
		return off;
	});

	const label = $derived.by(() => {
		if (error) return `No se pudo abrir la ciudad: ${error}`;
		switch (progress.stage) {
			case 'manifest':
				return 'Abriendo el catálogo…';
			case 'engine':
				return 'Comprobando el motor…';
			case 'model': {
				const mb = (n: number) => (n / 1e6).toFixed(0);
				return progress.total
					? `Llega el bibliotecario: ${mb(progress.loaded)} de ${mb(progress.total)} MB`
					: 'Llega el bibliotecario…';
			}
			case 'verify':
				return 'Comprobando cada archivo…';
			case 'ready':
				return '';
		}
	});
</script>

{#if label}
	<p class="status" class:error role="status">
		{label}
		{#if progress.stage === 'model' && progress.total}
			<span class="bar" style:--done={progress.loaded / progress.total}></span>
		{/if}
	</p>
{/if}

<style>
	.status {
		margin: 0;
		font-family: var(--body);
		font-style: italic;
		font-size: 0.95rem;
		color: var(--ink-faint);
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 12rem;
	}
	.error {
		color: var(--madder);
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
