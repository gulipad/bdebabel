<script lang="ts">
	/** Ink test bench: an invisible hand writes on a full sheet; you can also paint on it with the pointer. */
	import { onMount } from 'svelte';
	import {
		BRUSH_IDS,
		DEFAULT_WRITE,
		HANDS,
		INKS,
		InkSheet,
		PAPER_IDS,
		type HandId,
		type InkId
	} from '#lib/ink/sheet.ts';

	let canvas: HTMLCanvasElement;
	let sheet: InkSheet | null = null;
	let error = $state('');
	let busy = $state(false);

	let text = $state('La Ciudad de Babel');
	let hand = $state<HandId>(DEFAULT_WRITE.hand);
	let ink = $state<InkId>('sepia');
	let paper = $state('cold');
	let brush = $state('round');
	let size = $state(DEFAULT_WRITE.size);
	let speed = $state(DEFAULT_WRITE.speed);
	let load = $state(0.85);
	let water = $state(0.5);

	$effect(() => sheet?.setLoad(load, water));
	$effect(() => sheet?.setInk(ink));
	$effect(() => sheet?.setPaper(paper));
	$effect(() => sheet?.setBrush(brush));

	async function write() {
		if (!sheet || busy) return;
		busy = true;
		try {
			await sheet.write(text, { hand, size, speed });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	onMount(() => {
		try {
			sheet = new InkSheet(canvas, { paper, ink, brush });
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return;
		}
		write();
		return () => sheet?.destroy();
	});
</script>

<svelte:head><title>Prueba de tinta · La Ciudad de Babel</title></svelte:head>

<div class="bench">
	<canvas
		bind:this={canvas}
		aria-label="Hoja de acuarela: la mano escribe; también puedes pintar con el dedo"
	></canvas>

	<form class="tools" onsubmit={(e) => (e.preventDefault(), write())}>
		<input id="text" bind:value={text} aria-label="Texto" />
		<select id="hand" bind:value={hand} aria-label="Letra">
			{#each Object.entries(HANDS) as [id, name] (id)}<option value={id}>{name}</option>{/each}
		</select>
		<select id="ink" bind:value={ink} aria-label="Tinta">
			{#each Object.entries(INKS) as [id, v] (id)}<option value={id}>{v.name}</option>{/each}
		</select>
		<select id="paper" bind:value={paper} aria-label="Papel">
			{#each PAPER_IDS as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
		</select>
		<select id="brush" bind:value={brush} aria-label="Pincel">
			{#each BRUSH_IDS as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
		</select>
		<label
			>tamaño <input
				id="size"
				type="range"
				min="0.03"
				max="0.25"
				step="0.005"
				bind:value={size}
			/></label
		>
		<label
			>velocidad <input
				id="speed"
				type="range"
				min="0.05"
				max="1.5"
				step="0.05"
				bind:value={speed}
			/></label
		>
		<label
			>pigmento <input
				id="load"
				type="range"
				min="0"
				max="1"
				step="0.05"
				bind:value={load}
			/></label
		>
		<label
			>agua <input id="water" type="range" min="0" max="1" step="0.05" bind:value={water} /></label
		>
		<button type="submit" disabled={busy}>Escribir</button>
		<button type="button" onclick={() => sheet?.dry()}>Secar</button>
		<button type="button" onclick={() => sheet?.clear()}>Limpiar</button>
	</form>

	{#if error}<p class="error" role="alert">{error}</p>{/if}
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
		touch-action: none;
	}
	.tools {
		position: absolute;
		left: max(12px, env(safe-area-inset-left, 0px));
		right: max(12px, env(safe-area-inset-right, 0px));
		bottom: calc(12px + env(safe-area-inset-bottom, 0px));
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(0, 0, 0, 0.12);
		font-family: var(--mono);
		font-size: 0.72rem;
	}
	.tools input:not([type='range']) {
		flex: 1 1 12rem;
		min-width: 0;
		font: inherit;
		padding: 0.4rem;
	}
	.tools select,
	.tools button {
		font: inherit;
	}
	.tools label {
		display: flex;
		gap: 0.3rem;
		align-items: center;
	}
	.error {
		position: absolute;
		top: 1rem;
		left: 1rem;
		color: #a4473b;
		background: #fff;
		padding: 0.5rem;
	}
</style>
