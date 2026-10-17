<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import favicon from '#lib/assets/favicon.svg';
	import Paper from '#lib/components/Paper.svelte';
	import Loading from '#lib/components/Loading.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>La Ciudad de Babel</title>
</svelte:head>

<Paper />

<div class="city">
	<header>
		<a href={resolve('/')} class="name">La Ciudad de Babel</a>
		<Loading />
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.city {
		max-width: 46rem;
		margin: 0 auto;
		padding-block: 1.2rem 4rem;
		padding-left: max(16px, env(safe-area-inset-left, 0px));
		padding-right: max(16px, env(safe-area-inset-right, 0px));
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		align-items: baseline;
		justify-content: space-between;
	}
	.name {
		font-family: var(--signature);
		font-size: 2rem;
		line-height: 1;
		color: var(--ink);
		text-decoration: none;
	}
</style>
