<script lang="ts">
	import Callout from './Callout.svelte';
	import DataTable from './DataTable.svelte';
	import { getCanvasContext } from './context.js';
	import { formatNumber, layoutBars, round } from './geometry.js';
	import type { BarDatum } from './types.js';

	interface Props {
		bars: readonly BarDatum[];
		/** Caption of the hidden data table. */
		title: string;
		/** Unit after a number in the table, e.g. `%`. */
		unit?: string;
		/** Fixed value range; by default the values plus zero. */
		domain?: [number, number];
	}

	let { bars, title, unit, domain }: Props = $props();

	const canvas = getCanvasContext();
	/* Value callouts above, bar labels and group labels below (two Mono rows). */
	const ROW = 16;
	let hasGroups = $derived(bars.some((bar) => bar.group));
	let box = $derived({
		left: 8,
		right: canvas.width - 8,
		top: ROW + 4,
		bottom: canvas.height - ROW * (hasGroups ? 2 : 1) - 8
	});
	let layout = $derived(
		layoutBars(
			bars.map((bar) => ({ value: bar.value, group: bar.group })),
			box,
			domain
		)
	);
	let rows = $derived(
		bars.map((bar) => [
			bar.group ? `${bar.group} · ${bar.label}` : bar.label,
			bar.display ?? `${formatNumber(bar.value)}${unit ? ` ${unit}` : ''}`
		])
	);
</script>

<!-- DataViz.Bars: a distribution on one baseline. Outlines by default, solid where it matters. -->
<svg class="figure-plate-layer" viewBox={canvas.viewBox} aria-hidden="true" focusable="false">
	{#each layout.bars as rect (rect.index)}
		{#if rect.height > 0}
			<rect
				class="figure-plate-bar"
				data-emphasis={bars[rect.index].emphasis || undefined}
				data-accent={bars[rect.index].accent}
				x={round(rect.x - rect.width / 2)}
				y={round(rect.y)}
				width={round(rect.width)}
				height={round(rect.height)}
				vector-effect="non-scaling-stroke"
			/>
		{/if}
	{/each}
	<line
		class="figure-plate-axis"
		x1={box.left}
		y1={round(layout.baseline)}
		x2={box.right}
		y2={round(layout.baseline)}
		vector-effect="non-scaling-stroke"
	/>
</svg>
{#each layout.bars as rect (rect.index)}
	{@const bar = bars[rect.index]}
	{#if bar.display}
		<Callout x={rect.x} y={(rect.negative ? layout.baseline : rect.tip.y) - 2}>
			{bar.display}
		</Callout>
	{/if}
	<Callout x={rect.x} y={box.bottom + 4} place="below">{bar.label}</Callout>
{/each}
{#each layout.groups as group (group.from)}
	<Callout x={group.x} y={box.bottom + 4 + ROW} place="below">{group.key}</Callout>
{/each}
<DataTable caption={title} columns={['Balken', 'Wert']} {rows} />
