<script lang="ts">
	/**
	 * The paper under the inner pages: the cover's own (src/lib/pen makePaper). Its grain and clouds are the page's
	 * background, so they scroll with the text, as print does on paper; the light falling off towards the edges
	 * stays with the window, multiplied over it. The grain repeats every two screens, the second one upside down,
	 * so there is no seam. Melts (ui/melt.ts) are given the paper as it is on screen at that moment.
	 */
	import { onMount } from 'svelte';
	import { compose, makePaper, rimShade } from '#lib/pen/pen.ts';
	import { showPaper } from './paper.ts';

	let light: HTMLCanvasElement;

	onMount(() => {
		let timer = 0,
			dpr = 1,
			url = '',
			tile: HTMLImageElement | null = null,
			gone = false;
		const body = document.body.style;

		async function draw() {
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			const w = Math.round(innerWidth * dpr),
				h = Math.round(innerHeight * dpr);
			light.width = w;
			light.height = h;
			light.getContext('2d')!.putImageData(rimShade(w, h), 0, 0);
			// two screens of grain, the second the first upside down
			const one = document.createElement('canvas');
			one.width = w;
			one.height = h;
			compose(one.getContext('2d')!, makePaper(w, h, { scale: dpr, rim: false }), []);
			const two = document.createElement('canvas');
			two.width = w;
			two.height = 2 * h;
			const g = two.getContext('2d')!;
			g.drawImage(one, 0, 0);
			g.translate(0, 2 * h);
			g.scale(1, -1);
			g.drawImage(one, 0, 0);
			const blob = await new Promise<Blob | null>((done) => two.toBlob(done, 'image/jpeg', 0.92));
			if (!blob || gone) return;
			// the same decoded image is the background and what melts copy, so the two match exactly
			const next = URL.createObjectURL(blob),
				im = new Image();
			im.src = next;
			await im.decode().catch(() => {});
			if (gone) return URL.revokeObjectURL(next);
			body.backgroundImage = `url(${next})`;
			body.backgroundRepeat = 'repeat-y';
			body.backgroundSize = `${w / dpr}px ${(2 * h) / dpr}px`;
			body.backgroundPosition = '0 0';
			if (url) URL.revokeObjectURL(url);
			[url, tile] = [next, im];
		}

		// the paper as it is on screen now: the grain where the page has scrolled it to, under the light
		const screen = document.createElement('canvas');
		let at = NaN;
		function onScreen() {
			if (!tile) return light;
			if (screen.width !== light.width || screen.height !== light.height || at !== scrollY) {
				screen.width = light.width;
				screen.height = light.height;
				const g = screen.getContext('2d')!,
					period = tile.naturalHeight;
				for (let y = -(Math.round(scrollY * dpr) % period); y < screen.height; y += period)
					g.drawImage(tile, 0, y);
				g.globalCompositeOperation = 'multiply';
				g.drawImage(light, 0, 0);
				at = scrollY;
			}
			return screen;
		}

		const redraw = () => {
			clearTimeout(timer);
			timer = window.setTimeout(draw, 200);
		};
		draw();
		const hide = showPaper(onScreen);
		addEventListener('resize', redraw);
		return () => {
			gone = true;
			hide();
			removeEventListener('resize', redraw);
			for (const k of [
				'background-image',
				'background-repeat',
				'background-size',
				'background-position'
			])
				body.removeProperty(k);
			if (url) URL.revokeObjectURL(url);
		};
	});
</script>

<canvas bind:this={light} aria-hidden="true"></canvas>

<style>
	canvas {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		pointer-events: none;
		mix-blend-mode: multiply;
	}
</style>
