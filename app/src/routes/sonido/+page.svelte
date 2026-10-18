<script lang="ts">
	/**
	 * Sound test bench for the cover's reveal: the variants made by lab/sound/reveal.py, alone or played with
	 * the cover itself (reloaded in a frame at the same moment, so the two start together).
	 */
	import { asset, resolve } from '$app/paths';

	const VARIANTS = [
		{
			id: 'zumbido',
			name: 'Zumbido',
			note: 'A hum on E1 and a rubbed bowl a tritone above; a bloom as the title arrives.'
		},
		{
			id: 'vertigo',
			name: 'Vértigo',
			note: 'Darker: a tritone inside the hum, a slow breathing, a ring that bends down.'
		},
		{
			id: 'aliento',
			name: 'Aliento',
			note: 'Airier: a breath that brightens as the plan melts in, a high glass ring.'
		}
	] as const;

	type Id = (typeof VARIANTS)[number]['id'];
	const src = (id: Id) => asset(`sound/${id}.wav`);

	let watching = $state<Id | null>(null);
	let frame = $state(0); // a new frame each time, so the cover starts from the beginning
	let player: HTMLAudioElement | null = null;

	function withCover(id: Id) {
		player?.pause();
		watching = id;
		frame++;
		player = new Audio(src(id));
		player.play().catch(() => {});
	}
	function stop() {
		player?.pause();
		player = null;
		watching = null;
	}
</script>

<svelte:head><title>Sonido · La Ciudad de Babel</title></svelte:head>

{#if watching}
	<div class="cover">
		{#key frame}
			<iframe src={resolve('/portada')} title="La portada"></iframe>
		{/key}
		<button type="button" class="stop" onclick={stop}>Parar</button>
	</div>
{/if}

<section>
	<h1>El sonido de la portada</h1>
	<p>Headphones help: most of it lives below 120 Hz.</p>
	{#each VARIANTS as v (v.id)}
		<article>
			<h2>{v.name}</h2>
			<p>{v.note}</p>
			<audio controls preload="auto" src={src(v.id)}></audio>
			<button type="button" onclick={() => withCover(v.id)}>Con la portada</button>
		</article>
	{/each}
</section>

<style>
	section {
		display: flex;
		flex-direction: column;
		gap: 1.6rem;
	}
	article {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h2 {
		margin: 0;
	}
	p {
		margin: 0;
	}
	audio {
		width: 100%;
	}
	button {
		align-self: flex-start;
		font: inherit;
		padding: 0.3rem 0.8rem;
		cursor: pointer;
	}
	.cover {
		position: fixed;
		inset: 0;
		z-index: 20;
		background: #efe0bf;
	}
	iframe {
		width: 100%;
		height: 100%;
		border: 0;
	}
	.stop {
		position: absolute;
		right: 1rem;
		bottom: 1rem;
	}
</style>
