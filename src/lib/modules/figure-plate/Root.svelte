<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Fixed number; omitted, the plate counts itself on the page (CSS counter `figure-plate`). */
		index?: number;
		/** Name of the figure for assistive technology; the caption is its visible line. */
		label?: string;
		class?: string;
		children: Snippet;
	}

	let { index, label, class: className, children }: Props = $props();
</script>

<!--
	P7 FigurePlate (DESIGN.md §11, konzept Z2): a plate with a vertical Mono label FIG_01 on its left
	edge, the canvas and one Mono caption line. The number counts per page without script, so the
	prerendered page and the hydrated one agree; `index` sets it, and the plates after it follow.
-->
<figure
	class={['figure-plate', className]}
	data-figure
	aria-label={label}
	style:counter-set={index === undefined ? undefined : `figure-plate ${index}`}
>
	<span class="figure-plate-label" aria-hidden="true"></span>
	{@render children()}
</figure>
