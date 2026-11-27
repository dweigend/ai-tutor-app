<script lang="ts">
	import Formula from '../../math/Formula.svelte';
	import { splitFormulas } from '../../math/editorial-formulas.js';
	import { parseRichText, splitGreek } from './rich-text.js';

	/** Text in the fixed notation of rich-text.ts (`10^{−6}`, `w_{0}`). Never HTML. */
	let { text }: { text: string } = $props();

	let parts = $derived(splitFormulas(text));
</script>

{#snippet run(text: string)}{#each splitGreek(text) as part, index (index)}{#if part.greek}<span
				data-code="inline"
			>
				{part.text}
			</span>{:else}{part.text}{/if}{/each}{/snippet}

{#each parts as part, partIndex (partIndex)}
	{#if part.kind === 'formula'}
		<Formula formula={part.formula} />
	{:else}
		{#each parseRichText(part.text) as token, index (index)}{#if token.kind === 'sup'}<sup
					class="rt-sup"
				>
					{@render run(token.text)}
				</sup>{:else if token.kind === 'sub'}<sub class="rt-sub">
					{@render run(token.text)}
				</sub>{:else}{@render run(token.text)}{/if}{/each}
	{/if}
{/each}

<style>
	/*
	 * Line size, not a fifth type size (DESIGN.md §6.1): `font: inherit` undoes the browser's
	 * smaller size, so the run keeps the font of its line and only leaves the baseline.
	 * line-height 0 keeps the line box from growing.
	 */
	.rt-sup,
	.rt-sub {
		position: relative;
		font: inherit;
		line-height: 0;
		vertical-align: baseline;
	}

	.rt-sup {
		inset-block-start: -0.4em;
	}

	.rt-sub {
		inset-block-start: 0.25em;
	}
</style>
