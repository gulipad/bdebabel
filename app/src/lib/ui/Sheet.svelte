<script lang="ts">
	/** The sheet under the inner pages: the cover's own paper (src/lib/pen makePaper), bare, filling the screen. */
	import { onMount } from 'svelte';
	import { compose, makePaper } from '#lib/pen/pen.ts';

	let canvas: HTMLCanvasElement;

	onMount(() => {
		let timer = 0;
		const draw = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.width = Math.round(innerWidth * dpr);
			canvas.height = Math.round(innerHeight * dpr);
			compose(canvas.getContext('2d')!, makePaper(canvas.width, canvas.height, { scale: dpr }), []);
		};
		const redraw = () => {
			clearTimeout(timer);
			timer = window.setTimeout(draw, 200);
		};
		draw();
		addEventListener('resize', redraw);
		return () => removeEventListener('resize', redraw);
	});
</script>

<canvas bind:this={canvas} aria-hidden="true"></canvas>

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		background: var(--paper);
	}
</style>
