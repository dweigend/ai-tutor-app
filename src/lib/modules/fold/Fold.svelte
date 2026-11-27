<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		/** Short label, shown in capitals (≤ 3 words, DESIGN.md §6.4). */
		label: string;
		/** A true count of what is inside, shown as `[05]`. Omit when there is nothing to count. */
		count?: number;
		open?: boolean;
		/** Accessible name of the trigger, e.g. "Quellen öffnen"; defaults to the label. */
		triggerLabel?: string;
		/** Extra classes, e.g. to place the trigger and the content in a stage grid. */
		class?: string;
		contentClass?: string;
		/** Renders the root as `display: contents`, so trigger and content join the parent grid. */
		flat?: boolean;
		inert?: boolean;
		children: Snippet;
	}

	let {
		label,
		count,
		open = $bindable(false),
		triggerLabel,
		class: className,
		contentClass,
		flat = false,
		inert,
		children
	}: Props = $props();

	const pad = (value: number) => String(value).padStart(2, '0');
</script>

<!--
	P8 Fold: one 44px row `LABEL [05] +` that opens in place. `+` and `−` are JetBrains Mono signs
	with a hard switch (DESIGN.md §7). hiddenUntilFound lets the browser's find open it.
-->
<Collapsible.Root bind:open>
	{#snippet child({ props })}
		<div {...props} class={['fold', className]} data-flat={flat || undefined} {inert}>
			<Collapsible.Trigger class="m-hit fold-trigger" aria-label={triggerLabel}>
				<span class="m-label fold-label">
					{label}{#if count !== undefined}<span class="fold-count">[{pad(count)}]</span>{/if}
				</span>
				<span class="fold-sign" aria-hidden="true">{open ? '−' : '+'}</span>
			</Collapsible.Trigger>
			<Collapsible.Content class={['fold-content', contentClass]} hiddenUntilFound>
				{@render children()}
			</Collapsible.Content>
		</div>
	{/snippet}
</Collapsible.Root>
