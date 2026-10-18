<script lang="ts">
	/** On a phone or a tablet, before anything: the city is made for a desktop; going in anyway is remembered. */
	import InkLink from './InkLink.svelte';
	import Sheet from './Sheet.svelte';

	let { oncontinue }: { oncontinue: () => void } = $props();
</script>

<Sheet />
<section class="notice">
	<h1>La Biblioteca de Babel</h1>
	<p>
		Esta biblioteca está optimizada para ordenador. Utiliza procesamiento gráfico que puede ser
		lento en dispositivos móviles.
	</p>
	<InkLink onclick={oncontinue}>Entrar igualmente</InkLink>
</section>

<style>
	.notice {
		min-height: 100svh;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 1.6rem;
		padding-block: 2rem;
		padding-left: max(24px, env(safe-area-inset-left, 0px));
		padding-right: max(24px, env(safe-area-inset-right, 0px));
		text-align: center;
	}
	h1 {
		margin: 0;
		font: 400 1.7rem var(--display-sc);
		letter-spacing: 0.16em;
		color: var(--ink);
		text-wrap: balance;
	}
	p {
		margin: 0;
		max-width: 22rem;
		font-size: 1.15rem;
		line-height: 1.55;
		color: var(--ink);
		text-wrap: pretty;
	}
</style>
