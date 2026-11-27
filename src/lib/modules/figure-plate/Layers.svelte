<script lang="ts">
	import Callout from './Callout.svelte';
	import DataTable from './DataTable.svelte';
	import { getCanvasContext } from './context.js';
	import { isometricSquare, pointsAttribute } from './geometry.js';
	import type { LayerDatum } from './types.js';

	interface Props {
		/** Bottom to top. */
		layers: readonly LayerDatum[];
		title: string;
	}

	let { layers, title }: Props = $props();

	const canvas = getCanvasContext();
	/* The stack stands left of centre; its labels hang on hairlines to the right. */
	let origin = $derived({ x: canvas.width * 0.32, y: canvas.height * 0.62 });
	let full = $derived(Math.min(canvas.width * 0.42, canvas.height * 0.9));
	let rise = $derived(layers.length > 1 ? (canvas.height * 0.5) / (layers.length - 1) : 0);
	let faces = $derived(
		layers.map((layer, index) => {
			const points = isometricSquare(origin, full * (layer.size ?? 1), index * rise);
			return { points, right: points[1] };
		})
	);
	let rows = $derived(
		layers.map((layer, index) => [String(index + 1), layer.label, layer.note ?? '–'])
	);
</script>

<!-- DataViz.Layers: isometric slabs, outlines only; one layer may carry the accent. -->
<svg class="figure-plate-layer" viewBox={canvas.viewBox} aria-hidden="true" focusable="false">
	{#each faces as face, index (index)}
		<polygon
			class="figure-plate-face"
			data-accent={layers[index].emphasis ? 'mark' : undefined}
			points={pointsAttribute(face.points)}
			vector-effect="non-scaling-stroke"
		/>
	{/each}
</svg>
{#each faces as face, index (index)}
	<Callout
		x={face.right.x}
		y={face.right.y}
		labelX={canvas.width - 112}
		labelY={face.right.y}
		place="right"
	>
		{layers[index].label}
	</Callout>
{/each}
<DataTable caption={title} columns={['Schicht', 'Name', 'Angabe']} {rows} />
