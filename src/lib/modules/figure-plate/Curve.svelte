<script lang="ts">
	import Callout from './Callout.svelte';
	import DataTable from './DataTable.svelte';
	import { getCanvasContext } from './context.js';
	import { domainWithZero, formatNumber, linear, polylinePath, round } from './geometry.js';
	import type { CurvePoint } from './types.js';

	interface Props {
		/** Samples of the function, in data units, left to right. */
		points: readonly CurvePoint[];
		/** Marked points (steps, a minimum): squares, joined by a line when `steps` is set. */
		marks?: readonly CurvePoint[];
		/** Join the marks in order, e.g. the steps of gradient descent. */
		steps?: boolean;
		title: string;
		/** Names of the axes for the hidden table. */
		xLabel?: string;
		yLabel?: string;
		domainX?: [number, number];
		domainY?: [number, number];
	}

	let {
		points,
		marks = [],
		steps = false,
		title,
		xLabel = 'x',
		yLabel = 'y',
		domainX,
		domainY
	}: Props = $props();

	const canvas = getCanvasContext();
	const MARK = 6;
	let all = $derived([...points, ...marks]);
	let x = $derived(
		linear(domainX ?? domainWithZero(all.map((point) => point.x)), [12, canvas.width - 12])
	);
	let y = $derived(
		linear(domainY ?? domainWithZero(all.map((point) => point.y)), [canvas.height - 12, 20])
	);
	let rows = $derived(
		(marks.length ? marks : points).map((point) => [
			point.label ?? formatNumber(point.x),
			formatNumber(point.y)
		])
	);
</script>

<!-- DataViz.Curve: a function as a 1px line, its marked points as squares, nothing round. -->
<svg class="figure-plate-layer" viewBox={canvas.viewBox} aria-hidden="true" focusable="false">
	<line
		class="figure-plate-axis"
		x1="12"
		y1={round(y(0))}
		x2={canvas.width - 12}
		y2={round(y(0))}
		vector-effect="non-scaling-stroke"
	/>
	<path
		class="figure-plate-line"
		d={polylinePath(points, x, y)}
		vector-effect="non-scaling-stroke"
	/>
	{#if steps && marks.length > 1}
		<path
			class="figure-plate-line"
			data-accent="grip"
			d={polylinePath(marks, x, y)}
			vector-effect="non-scaling-stroke"
		/>
	{/if}
	{#each marks as mark, index (index)}
		<rect
			class="figure-plate-node"
			data-accent="mark"
			x={round(x(mark.x) - MARK / 2)}
			y={round(y(mark.y) - MARK / 2)}
			width={MARK}
			height={MARK}
			vector-effect="non-scaling-stroke"
		/>
	{/each}
</svg>
{#each marks as mark, index (index)}
	{#if mark.label}
		<Callout x={x(mark.x)} y={y(mark.y) - MARK}>{mark.label}</Callout>
	{/if}
{/each}
<DataTable caption={title} columns={[xLabel, yLabel]} {rows} />
