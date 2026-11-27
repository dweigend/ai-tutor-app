<script lang="ts">
	import Callout from './Callout.svelte';
	import DataTable from './DataTable.svelte';
	import { getCanvasContext } from './context.js';
	import { formatNumber, innerSide, round } from './geometry.js';

	interface Props {
		/** Shares 0…1, row by row: a heatmap, a mask or a learning state. */
		values: readonly (readonly number[])[];
		rowLabels?: readonly string[];
		columnLabels?: readonly string[];
		title: string;
		/** Fill of the inner squares: ink, or one of the two accents. */
		accent?: 'mark' | 'grip';
	}

	let { values, rowLabels = [], columnLabels = [], title, accent }: Props = $props();

	const canvas = getCanvasContext();
	let columns = $derived(Math.max(1, ...values.map((row) => row.length)));
	/* Room for row labels on the left and column labels on top. */
	let left = $derived(rowLabels.length ? 64 : 8);
	let top = $derived(columnLabels.length ? 24 : 8);
	let side = $derived(
		Math.min(
			(canvas.width - left - 8) / columns,
			(canvas.height - top - 8) / Math.max(1, values.length)
		)
	);
	let rows = $derived(
		values.map((row, index) => [
			rowLabels[index] ?? String(index + 1),
			...row.map((value) => formatNumber(value))
		])
	);
</script>

<!--
	DataViz.Matrix: Quadrat im Quadrat. A share is an area, never an opacity or a gradient
	(konzept Z2): the outer square is the whole, the inner one's area is the value.
-->
<svg class="figure-plate-layer" viewBox={canvas.viewBox} aria-hidden="true" focusable="false">
	{#each values as row, r (r)}
		{#each row as value, c (c)}
			{@const inner = innerSide(value, side - 4)}
			<rect
				class="figure-plate-cell"
				x={round(left + c * side)}
				y={round(top + r * side)}
				width={round(side)}
				height={round(side)}
				vector-effect="non-scaling-stroke"
			/>
			{#if inner > 0}
				<rect
					class="figure-plate-share"
					data-accent={accent}
					x={round(left + c * side + (side - inner) / 2)}
					y={round(top + r * side + (side - inner) / 2)}
					width={round(inner)}
					height={round(inner)}
				/>
			{/if}
		{/each}
	{/each}
</svg>
{#each rowLabels as label, r (r)}
	<Callout x={left - 4} y={top + (r + 0.5) * side} place="left">{label}</Callout>
{/each}
{#each columnLabels as label, c (c)}
	<Callout x={left + (c + 0.5) * side} y={top - 4}>{label}</Callout>
{/each}
<DataTable
	caption={title}
	columns={['', ...Array.from({ length: columns }, (_, c) => columnLabels[c] ?? String(c + 1))]}
	{rows}
/>
