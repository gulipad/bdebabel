<script lang="ts">
	/**
	 * Going somewhere: whatever you have of a place (a room's name or link, a page's address or link, an
	 * address cut short), and then, if you like, the wall, shelf, book and page. It goes as far down as it is
	 * told: to the page when all four are there, otherwise into the room, at the wall, shelf or book.
	 */
	import { goto } from '$app/navigation';
	import {
		addressIn,
		MEASURES,
		PAGES,
		placeParts,
		SHELVES,
		strangers,
		VOLUMES,
		WALLS
	} from '#lib/address.ts';
	import { roomLink, withPhrase } from '#lib/browse/links.ts';
	import InkLink from '#lib/ui/InkLink.svelte';
	import { enterSubmits } from '#lib/ui/keys.ts';

	let text = $state(''),
		bad = $state(false);
	/** the wall, shelf, book and page: filled in from what was pasted, and free to change */
	let wall = $state<number | null>(null),
		shelf = $state<number | null>(null),
		volume = $state<number | null>(null),
		page = $state<number | null>(null);
	const parts = $derived(placeParts(text));
	const FIELDS = [
		{ name: 'muro', max: WALLS, get: () => wall, set: (v: number | null) => (wall = v) },
		{ name: 'balda', max: SHELVES, get: () => shelf, set: (v: number | null) => (shelf = v) },
		{ name: 'volumen', max: VOLUMES, get: () => volume, set: (v: number | null) => (volume = v) },
		{ name: 'página', max: PAGES, get: () => page, set: (v: number | null) => (page = v) }
	];

	/** the universe is always the same, so it is written for you: one pasted with it loses it */
	const UNIVERSE = 'babel-1';
	function read() {
		bad = false;
		if (text.trimStart().startsWith(`${UNIVERSE}:`))
			text = text.trimStart().slice(UNIVERSE.length + 1);
		// what was pasted fills in the four, even when it is out of range (so that is said, below)
		// (a bare room's name leaves the four as they are)
		const p = placeParts(text);
		if (!p || p.wall === undefined) return;
		wall = p.wall ?? null;
		shelf = p.shelf ?? null;
		volume = p.volume ?? null;
		page = p.page ?? null;
	}
	const int = (v: number | null, max: number) =>
		v !== null && Number.isInteger(v) && v >= 1 && v <= max ? v : undefined;

	/** what is wrong, said as it is written: a stray character in the room's name, a part out of range */
	const problems = $derived.by(() => {
		const out: string[] = [];
		const odd = parts ? strangers(parts.hexagon) : '';
		if (odd)
			out.push(
				`El nombre de una sala sólo lleva letras sin tilde y cifras, y aquí sobra ${[...odd]
					.map((c) => `«${c}»`)
					.join(', ')}.`
			);
		const values = { wall, shelf, volume, page };
		for (const [key, name, max] of MEASURES) {
			const v = values[key];
			if (v !== null && !(v >= 1 && v <= max)) out.push(`${name} va de 1 a ${max}.`);
		}
		return out;
	});

	function go() {
		if (problems.length) return;
		const place = parts;
		if (!place) {
			bad = true;
			return;
		}
		const at = {
			wall: int(wall, WALLS),
			shelf: int(shelf, SHELVES),
			volume: int(volume, VOLUMES),
			page: int(page, PAGES)
		};
		const { universe, hexagon } = place;
		const to =
			at.wall && at.shelf && at.volume && at.page
				? withPhrase(
						addressIn(universe, hexagon, at.wall, at.shelf, at.volume, at.page),
						place.phrase
					)
				: roomLink(hexagon, at);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- both links resolve their routes
		goto(to);
	}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		go();
	}}
>
	<label class="field">
		<span class="sr">La sala, o la dirección</span>
		<span class="universe" aria-hidden="true">{UNIVERSE}:</span>
		<textarea
			bind:value={text}
			oninput={read}
			rows="2"
			spellcheck="false"
			placeholder="la sala, o sala:muro:balda:volumen:página, o un enlace"
			onkeydown={(e) => enterSubmits(e, go)}></textarea>
		<svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
			<path d="M1 5.6 C 24 4.2, 46 7, 66 5.2 S 90 4.8, 99 5.4" />
		</svg>
	</label>

	<div class="where">
		{#each FIELDS as f (f.name)}
			<label class="small">
				<span>{f.name}</span>
				<input
					inputmode="numeric"
					maxlength={String(f.max).length}
					placeholder="–"
					aria-invalid={f.get() !== null && (f.get()! < 1 || f.get()! > f.max)}
					value={f.get() ?? ''}
					oninput={(e) => {
						const digits = e.currentTarget.value.replace(/\D/g, '').slice(0, String(f.max).length);
						e.currentTarget.value = digits;
						f.set(digits ? Number(digits) : null);
					}}
				/>
			</label>
		{/each}
	</div>

	{#each problems as p (p)}<p class="error" role="alert">{p}</p>{/each}
	{#if bad && !problems.length}
		<p class="error" role="alert">No encuentro una sala ni una dirección en eso.</p>
	{/if}
	<div class="row">
		<InkLink onclick={go}>Ir</InkLink>
	</div>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.field {
		position: relative;
		display: block;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.field {
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: baseline;
		column-gap: 0.15rem;
	}
	.field svg {
		grid-column: 1 / -1;
	}
	.universe {
		font: 0.9rem var(--mono);
		color: var(--ink-faint);
	}
	textarea {
		display: block;
		width: 100%;
		min-width: 0;
		border: 0;
		background: none;
		color: var(--ink);
		outline: none;
		resize: none;
		font: 0.9rem/1.5 var(--mono);
		word-break: break-all;
		padding: 0.3rem 0 0.5rem;
	}
	::placeholder {
		color: var(--ink-faint);
		opacity: 0.7;
	}
	textarea::placeholder {
		font: italic 1.15rem var(--display);
	}
	/* a ruled line under it, inked darker when you write */
	.field svg {
		/* too thin for the pen's wobble, which would break the rule into pieces */
		filter: none !important;
		display: block;
		width: 100%;
		height: 0.6rem;
		overflow: visible;
	}
	.field path {
		fill: none;
		stroke: var(--sepia);
		stroke-width: 1.2px;
		vector-effect: non-scaling-stroke;
		opacity: 0.55;
		transition:
			opacity 0.3s,
			stroke-width 0.3s;
	}
	.field:focus-within path {
		opacity: 1;
		stroke-width: 1.8px;
	}
	/* the wall, shelf, book and page: four small ruled blanks */
	.where {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.6rem;
	}
	.small {
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		font: italic 1.05rem var(--display);
		color: var(--ink-dry);
	}
	.small input {
		width: 3.4rem;
		border: 0;
		border-bottom: 1px solid var(--sepia);
		background: none;
		font: 1rem var(--mono);
		color: var(--ink);
		text-align: center;
		padding: 0.1rem 0;
		outline: none;
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.small input::-webkit-inner-spin-button,
	.small input::-webkit-outer-spin-button {
		appearance: none;
		margin: 0;
	}
	.small input:focus {
		border-bottom-width: 2px;
	}
	.small input[aria-invalid='true'] {
		color: var(--madder);
		border-bottom-color: var(--madder);
	}
	.row {
		display: flex;
		justify-content: flex-end;
	}
	.error {
		margin: 0;
		color: var(--madder);
		font: italic 1.02rem var(--display);
	}
</style>
