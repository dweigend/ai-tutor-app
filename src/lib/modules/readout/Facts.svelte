<script lang="ts">
	import { drawnCode } from '../core/code-indent.js';
	import RichText from '../core/RichText.svelte';
	import type { FactsData } from './types.js';

	interface Props {
		facts: FactsData;
		/** Accessible name of the list. */
		label?: string;
	}

	let { facts, label = 'Fakten' }: Props = $props();
</script>

<!--
	Facts strip (DESIGN.md §10.1): ≤ 4 cells or a pair A/B, every cell on one line. Cells are flush
	with a 1px joint; `data-budget` lets the stage's budget guard measure each line. A code pair is
	set in --type-code-small (13 px, `data-code="small"`) with two spaces per level (K3).
-->
{#if facts.kind === 'cells'}
	<dl class="readout-facts" aria-label={label} style:--fact-count={facts.cells.length}>
		{#each facts.cells as cell, index (index)}
			<div class="readout-fact">
				<dt class="readout-fact-label" data-budget="fact"><RichText text={cell.label} /></dt>
				<dd class="readout-fact-value" data-budget="fact"><RichText text={cell.value} /></dd>
			</div>
		{/each}
	</dl>
{:else if facts.kind === 'pair'}
	<dl class="readout-pair" aria-label={label}>
		{#each facts.sides as side (side.key)}
			<div class="readout-pair-row">
				<dt class="readout-pair-key m-label">{side.key}</dt>
				<dd class="readout-pair-label" data-budget="fact"><RichText text={side.label} /></dd>
				<dd class="readout-pair-value" data-budget="fact"><RichText text={side.value} /></dd>
			</div>
		{/each}
	</dl>
{:else}
	<div class="readout-code-pair" role="group" aria-label={label}>
		{#each facts.sides as side (side.key)}
			<figure class="readout-code">
				<figcaption class="m-label">{side.key}</figcaption>
				<pre class="readout-code-text" data-budget="code" data-code="small"><code
						>{drawnCode(side.code)}</code
					></pre>
			</figure>
		{/each}
	</div>
{/if}
