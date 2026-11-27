<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getCanvasContext } from './context.js';
	import { percent } from './geometry.js';

	type Place = 'above' | 'below' | 'left' | 'right';

	interface Props {
		/** The point the label speaks about, in viewBox units. */
		x: number;
		y: number;
		/** Where the label sits; omitted, it sits on the point itself and no line is drawn. */
		labelX?: number;
		labelY?: number;
		/** Side of the label's anchor the text grows to. */
		place?: Place;
		children: Snippet;
	}

	let { x, y, labelX, labelY, place = 'above', children }: Props = $props();

	const canvas = getCanvasContext();
	let lx = $derived(labelX ?? x);
	let ly = $derived(labelY ?? y);
	let lined = $derived(labelX !== undefined || labelY !== undefined);
</script>

<!--
	A direct label with a hairline pointer instead of a legend box (konzept Z2). The line lives in
	the SVG and keeps 1px; the words are DOM over the canvas, in the label voice. Assistive
	technology reads the mark's hidden table instead, so the words are not read twice.
-->
{#if lined}
	<svg class="figure-plate-layer" viewBox={canvas.viewBox} aria-hidden="true" focusable="false">
		<line
			class="figure-plate-pointer"
			x1={x}
			y1={y}
			x2={lx}
			y2={ly}
			vector-effect="non-scaling-stroke"
		/>
	</svg>
{/if}
<span
	class="figure-plate-callout"
	aria-hidden="true"
	data-place={place}
	style:left="{percent(lx, canvas.width)}%"
	style:top="{percent(ly, canvas.height)}%"
>
	{@render children()}
</span>
