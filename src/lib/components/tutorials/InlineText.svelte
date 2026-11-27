<script lang="ts">
	import { Formula } from '$lib/math';
	import { RichText } from '$lib/modules';
	import { parseInline, type InlineNode } from './markdown';

	interface Props {
		/** Raw inline Markdown; parsed here when `nodes` is not given. */
		text?: string;
		nodes?: InlineNode[];
	}

	let { text = '', nodes }: Props = $props();

	let parts = $derived(nodes ?? parseInline(text));
</script>

<!-- Raised and lowered parts (`d_{k}`, `K^{T}`) go through RichText (DESIGN.md §6.9). -->
{#each parts as part, index (index)}
	{#if part.kind === 'formula'}<Formula
			formula={part.formula}
		/>{:else if part.kind === 'strong'}<strong>
			<RichText text={part.text} />
		</strong>{:else if part.kind === 'em'}<em>
			<RichText text={part.text} />
		</em>{:else if part.kind === 'code'}<code class="inline-code" data-code="inline">
			{part.text}
		</code>{:else}<RichText text={part.text} />{/if}
{/each}

<style>
	strong {
		font-weight: 650;
	}

	.inline-code {
		padding-inline: 0.2em;
		outline: var(--hairline-width) solid rgb(10 10 10 / 18%);
		outline-offset: -1px;
		background: var(--palette-white);
		font-size: 0.86em;
		overflow-wrap: anywhere;
	}
</style>
