<script lang="ts">
	/** The sheet under the whole city: lit paper that answers, slowly, to where the reader's hand is. */
	import { onMount } from 'svelte';
	import { context, fit, fullscreen, program } from '#lib/gl/gl.ts';
	import { PAPER_FRAGMENT } from '#lib/gl/paper.ts';

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const gl = context(canvas);
		if (!gl) return;
		const p = program(gl, PAPER_FRAGMENT);
		fullscreen(gl);
		gl.useProgram(p);
		const uRes = gl.getUniformLocation(p, 'uRes');
		const uLight = gl.getUniformLocation(p, 'uLight');
		let light = [0.2, 1.3];
		let target = light;
		let frame = 0;
		const draw = () => {
			frame = 0;
			fit(canvas, 0.5); // paper texture at half resolution: invisible difference, a quarter of the work
			light = [light[0] + (target[0] - light[0]) * 0.2, light[1] + (target[1] - light[1]) * 0.2];
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.uniform2f(uRes, canvas.width, canvas.height);
			gl.uniform2f(uLight, light[0], light[1]);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			if (Math.hypot(target[0] - light[0], target[1] - light[1]) > 0.002) request();
		};
		const request = () => (frame ||= requestAnimationFrame(draw));
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const move = (e: PointerEvent) => {
			if (reduce) return;
			const asp = innerWidth / innerHeight;
			// the light stays above the sheet and only leans toward the hand
			target = [0.2 + (e.clientX / innerWidth) * asp * 0.6, 1.3 - (e.clientY / innerHeight) * 0.5];
			request();
		};
		addEventListener('pointermove', move, { passive: true });
		addEventListener('resize', request);
		request();
		return () => {
			removeEventListener('pointermove', move);
			removeEventListener('resize', request);
			if (frame) cancelAnimationFrame(frame);
		};
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
