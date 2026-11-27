<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Link to the area overview. */
		href: string;
		/** Optional identifier shown before the title. */
		index?: string;
		/** Render as the screen's h1; turn off when the screen has its own main heading. */
		heading?: boolean;
		children: Snippet;
	}

	let { href, index, heading = true, children }: Props = $props();
</script>

{#snippet mark()}
	<a class="m-hit m-label shell-mark" {href}>
		{#if index}
			<span>{index}</span>
			<span aria-hidden="true">/</span>
		{/if}
		<span>{@render children()}</span>
	</a>
{/snippet}

{#if heading}
	<h1 class="shell-heading">{@render mark()}</h1>
{:else}
	{@render mark()}
{/if}

<style>
	.shell-heading {
		display: flex;
		min-inline-size: 0;
		font: inherit;
		letter-spacing: inherit;
	}

	.shell-mark {
		display: inline-flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--step-2);
		padding-inline: var(--gutter);
		white-space: nowrap;
	}
</style>
