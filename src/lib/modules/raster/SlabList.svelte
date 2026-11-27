<script lang="ts">
	import SwipeRow from '../core/SwipeRow.svelte';
	import type { SwipeAction } from '../core/swipe.js';
	import Cell from './Cell.svelte';
	import type { Slab } from './types.js';

	interface Props {
		items: readonly Slab[];
		label: string;
		/**
		 * Swipe right for later, left for away, with keys for keyboard users (DESIGN.md §11.5,
		 * §14.1). Off by default; Issue #11 turns it on for the exercises until David decides.
		 */
		swipeable?: boolean;
		/** Generation per id: a new value remounts that row, which ends its undo line. */
		generations?: Readonly<Record<string, number>>;
		onaction?: (id: string, action: SwipeAction) => void;
		onundo?: (id: string, action: SwipeAction) => void;
	}

	let { items, label, swipeable = false, generations = {}, onaction, onundo }: Props = $props();
</script>

{#snippet slab(item: Slab)}
	<a class="raster-cell slab" href={item.href} data-state={item.state}>
		<Cell selected={item.state === 'done'}>
			<span class="slab-title">{item.title}</span>
			{#if item.state === 'done'}
				<span class="visually-hidden">, erledigt</span>
			{:else}
				<span class="slab-meta">{item.meta}</span>
			{/if}
		</Cell>
	</a>
{/snippet}

<!--
	SlabList recipe (konzept M2): flush 64px blocks with a 1px joint, real links in an ol. Title
	(Archivo 600) and one reading (Mono). A done block shows ■ instead of the minutes.
-->
<ol class="raster" data-layout="rows" data-kind="link" data-frame="none" aria-label={label}>
	{#each items as item (`${item.id}:${generations[item.id] ?? 0}`)}
		<li class="raster-item" data-row>
			{#if swipeable}
				<SwipeRow
					flush
					name={item.title}
					onaction={(action) => onaction?.(item.id, action)}
					onundo={(action) => onundo?.(item.id, action)}
				>
					{@render slab(item)}
				</SwipeRow>
			{:else}
				{@render slab(item)}
			{/if}
		</li>
	{/each}
</ol>
