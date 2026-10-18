<script lang="ts">
	/**
	 * A logarithm in base 2, set as mathematics (MathML, which browsers lay out themselves): −log₂ p by
	 * default, or log₂ of a number (`of`), optionally negated.
	 */
	let { of = 'p', minus = true }: { of?: string; minus?: boolean } = $props();
</script>

<math
	>{#if minus}<mo>−</mo>{/if}<msub><mi>log</mi><mn>2</mn></msub><mspace width="0.17em"
	></mspace>{#if /^\d/.test(of)}<mn>{of}</mn>{:else}<mi>{of}</mi>{/if}</math
>

<style>
	math {
		font-family: 'STIX Two Math', 'Cambria Math', 'Latin Modern Math', 'IM Fell English', serif;
		font-size: 1.04em;
	}
</style>
