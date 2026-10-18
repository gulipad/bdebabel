<script lang="ts">
	/**
	 * The music's switch, always in the corner: a small inked horn, sounding or crossed out, with a volume
	 * slider that rises above it on hover. The music starts off; M turns it on and off from anywhere, except
	 * while writing in a box.
	 */
	import { soundtrack } from './soundtrack.svelte.ts';

	/** typing in a box (not on a slider or a button, where M is still the music's) */
	const writing = (e: Event) =>
		e.target instanceof HTMLElement &&
		(e.target.isContentEditable ||
			/^(TEXTAREA|SELECT)$/.test(e.target.tagName) ||
			(e.target instanceof HTMLInputElement &&
				!/^(range|checkbox|radio|button|submit)$/.test(e.target.type)));
	const mine = (e: Event) => e.target instanceof Element && !!e.target.closest('.sound');

	function key(e: KeyboardEvent) {
		if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey && !writing(e)) {
			e.preventDefault();
			soundtrack.toggle();
		} else if (!mine(e)) soundtrack.wake();
	}
	function touch(e: PointerEvent) {
		if (!mine(e)) soundtrack.wake();
	}
	const label = $derived(soundtrack.on ? 'Silenciar la música (M)' : 'Poner la música (M)');
</script>

<svelte:window onkeydown={key} onpointerdown={touch} />

<div
	class="sound"
	role="group"
	aria-label="Música"
	onpointerenter={() => soundtrack.prefetch()}
	onfocusin={() => soundtrack.prefetch()}
>
	<label class="volume">
		<span class="sr">Volumen</span>
		<input
			type="range"
			min="0"
			max="1"
			step="0.01"
			value={soundtrack.volume}
			oninput={(e) => soundtrack.setVolume(Number(e.currentTarget.value))}
		/>
	</label>
	<button
		type="button"
		onclick={() => soundtrack.toggle()}
		aria-pressed={soundtrack.on}
		aria-label={label}
		title={label}
	>
		<svg viewBox="0 0 32 32" aria-hidden="true">
			<path class="horn" d="M5 12.6 L10.2 12.4 L16.6 6.8 L16.9 25.3 L10.1 19.7 L5.2 19.5 Z" />
			{#if soundtrack.on}
				<path d="M20.4 12.3 C 22.2 14.4, 22.3 17.8, 20.5 19.9" />
				<path d="M23.6 9.3 C 27 13.2, 27.1 18.9, 23.7 22.9" />
			{:else}
				<path d="M20.6 12.4 L27.3 19.3 M27.1 12.2 L20.8 19.6" />
			{/if}
		</svg>
	</button>
</div>

<style>
	.sound {
		position: fixed;
		right: calc(0.9rem + env(safe-area-inset-right, 0px));
		bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px));
		z-index: 50;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	button {
		width: 2.6rem;
		height: 2.6rem;
		padding: 0.35rem;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--ink);
		cursor: pointer;
		opacity: 0.62;
		transition: opacity 0.3s;
	}
	.sound:hover button,
	button:focus-visible {
		opacity: 1;
	}
	button:focus-visible {
		outline: 1px solid var(--sepia);
		outline-offset: 2px;
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
		filter: url(#ink-wobble);
	}
	path {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.horn {
		fill: currentColor;
		fill-opacity: 0.12;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	/* the slider: a thin ruled line with an ink dot, rising above the horn on hover (none where there is no hover) */
	.volume {
		display: none;
		padding: 0.5rem 0 0.2rem;
		opacity: 0;
		transform: translateY(0.4rem);
		transition:
			opacity 0.25s,
			transform 0.25s;
	}
	@media (hover: hover) {
		.volume {
			display: block;
		}
		.sound:hover .volume,
		.sound:focus-within .volume {
			opacity: 1;
			transform: none;
		}
	}
	input {
		writing-mode: vertical-lr;
		direction: rtl;
		appearance: none;
		width: 1.4rem;
		height: 6.5rem;
		margin: 0;
		background: none;
		cursor: pointer;
	}
	input::-webkit-slider-runnable-track {
		width: 2px;
		margin: 0 auto;
		background: var(--sepia);
		border-radius: 1px;
	}
	input::-moz-range-track {
		width: 2px;
		background: var(--sepia);
	}
	input::-webkit-slider-thumb {
		appearance: none;
		width: 0.8rem;
		height: 0.8rem;
		margin-left: calc(-0.4rem + 1px);
		border-radius: 50%;
		background: var(--ink);
		border: 0;
	}
	input::-moz-range-thumb {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		background: var(--ink);
		border: 0;
	}
	input:focus-visible {
		outline: 1px solid var(--sepia);
		outline-offset: 2px;
	}
</style>
