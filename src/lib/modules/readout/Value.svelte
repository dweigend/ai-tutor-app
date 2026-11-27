<script lang="ts">
	import RichText from '../core/RichText.svelte';

	interface Props {
		/** The value as text, e.g. `0,476`; empty shows a dash placeholder. */
		value: string;
		unit?: string;
		/** display: Mono 400 ≥ 64px, the one display element of a screen. body: 17px. */
		size?: 'display' | 'body';
		/** Shown instead of an empty value; a real state, not a fake number. */
		placeholder?: string;
		id?: string;
	}

	let { value, unit, size = 'body', placeholder = '–', id }: Props = $props();
</script>

<!-- A readout ticks: its value changes hard, never tweened (DESIGN.md §4.1). -->
<output class="readout-value" data-size={size} {id}>
	{#if value}<RichText text={value} />{:else}<span class="readout-placeholder">
			{placeholder}
		</span>{/if}{#if unit}<span class="readout-unit">{unit}</span>{/if}
</output>
