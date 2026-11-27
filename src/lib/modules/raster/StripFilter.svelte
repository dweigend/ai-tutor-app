<script lang="ts">
	import { RadioGroup } from 'bits-ui';
	import Cell from './Cell.svelte';

	interface Item {
		value: string;
		/** Short name in the strip, e.g. `Blitz`. */
		label: string;
		/** Full name for assistive technology, e.g. `Blitzabruf`. */
		ariaLabel?: string;
	}

	interface Props {
		items: readonly Item[];
		value: string;
		label: string;
	}

	let { items, value = $bindable(), label }: Props = $props();

	let root = $state<HTMLElement | null>(null);

	/* The active entry rolls into view; the cut-off last word shows that the strip scrolls. */
	$effect(() => {
		const active = root?.querySelector<HTMLElement>('[data-selected]');
		active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

<!--
	StripFilter recipe (konzept M1): a 44px strip without counts or frames. One tab stop, ← →
	choose, Home and End jump (Bits UI RadioGroup). The strip scrolls sideways under the finger.
-->
<RadioGroup.Root
	bind:ref={root}
	class="raster"
	data-layout="strip"
	data-kind="single"
	orientation="horizontal"
	aria-label={label}
	bind:value
>
	{#each items as item (item.value)}
		<RadioGroup.Item value={item.value} aria-label={item.ariaLabel}>
			{#snippet child({ props, checked })}
				<button {...props} class="raster-cell m-label" data-selected={checked || undefined}>
					<Cell selected={checked}>{item.label}</Cell>
				</button>
			{/snippet}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
