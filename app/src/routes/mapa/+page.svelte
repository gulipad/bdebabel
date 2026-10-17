<script lang="ts">
	/** Map reveal test: the map of the city, drawn with the Library's own text, revealed in ink. */
	import { onMount } from 'svelte';
	import { drawMap, loadMapFonts } from '#lib/map/design.ts';
	import { revealMap } from '#lib/ink/reveal.ts';
	import { InkSheet } from '#lib/ink/sheet.ts';
	import { SAMPLE_TEXT } from '#lib/map/sample-text.ts';

	let canvas: HTMLCanvasElement;
	let sheet: InkSheet | null = null;
	let status = $state('Preparando el mapa…');
	let busy = $state(false);
	let text = '';

	async function open() {
		if (!sheet || busy) return;
		busy = true;
		status = '';
		try {
			sheet.clear();
			const [w, h] = sheet.engine.docSize;
			await revealMap(sheet, drawMap(w, h, text));
		} catch (e) {
			status = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		try {
			sheet = new InkSheet(canvas, { paper: 'cold', ink: 'sepia', brush: 'round' });
			sheet.engine.interactive = false;
		} catch (e) {
			status = e instanceof Error ? e.message : String(e);
			return;
		}
		// the walls are written with real pages of babel-1
		text = SAMPLE_TEXT;
		loadMapFonts().then(open);
		return () => sheet?.destroy();
	});
</script>

<svelte:head><title>El mapa · La Ciudad de Babel</title></svelte:head>

<div class="bench">
	<canvas bind:this={canvas} aria-label="El mapa de la ciudad, revelado en tinta"></canvas>
	<div class="tools">
		<button type="button" onclick={open} disabled={busy}>Abrir el mapa</button>
		{#if status}<span role="status">{status}</span>{/if}
	</div>
</div>

<style>
	.bench {
		position: fixed;
		inset: 0;
		z-index: 10;
		background: #fff;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.tools {
		position: absolute;
		left: max(12px, env(safe-area-inset-left, 0px));
		bottom: calc(12px + env(safe-area-inset-bottom, 0px));
		display: flex;
		gap: 0.6rem;
		align-items: center;
		font-family: var(--mono);
		font-size: 0.75rem;
		color: #5b3f2a;
	}
	.tools button {
		font: inherit;
	}
</style>
