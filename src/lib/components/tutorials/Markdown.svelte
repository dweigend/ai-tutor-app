<script lang="ts">
	import { Formula, InteractiveFormula, type FormulaSelection } from '$lib/math';
	import InlineText from './InlineText.svelte';
	import { parseMarkdown } from './markdown';

	interface Props {
		source: string;
		ontermchange?: (selection: FormulaSelection | null) => void;
	}

	let { source, ontermchange }: Props = $props();

	let blocks = $derived(parseMarkdown(source));
</script>

<div class="prose">
	{#each blocks as block, index (index)}
		{#if block.kind === 'formula'}
			{#if block.formula.interactiveTerms?.length}
				<InteractiveFormula formula={block.formula} {ontermchange} />
			{:else}
				<Formula formula={block.formula} display />
			{/if}
		{:else if block.kind === 'list' && block.ordered}
			<ol>
				{#each block.items as item, itemIndex (itemIndex)}
					<li><InlineText nodes={item} /></li>
				{/each}
			</ol>
		{:else if block.kind === 'list'}
			<ul>
				{#each block.items as item, itemIndex (itemIndex)}
					<li><InlineText nodes={item} /></li>
				{/each}
			</ul>
		{:else}
			<p><InlineText nodes={block.inlines} /></p>
		{/if}
	{/each}
</div>

<style>
	.prose {
		display: grid;
		gap: var(--step-3);
		min-inline-size: 0;
	}

	.prose > p,
	.prose > ul,
	.prose > ol {
		max-inline-size: 65ch;
		overflow-wrap: anywhere;
	}

	ul,
	ol {
		display: grid;
		gap: var(--step-1);
		padding-inline-start: 1.4em;
	}

	ul {
		list-style: '– ';
	}

	ol {
		list-style: decimal-leading-zero;
	}

	ol ::marker {
		font-family: var(--font-mono);
		font-size: var(--type-label);
	}
</style>
