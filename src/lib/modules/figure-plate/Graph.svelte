<script lang="ts">
	import Callout from './Callout.svelte';
	import DataTable from './DataTable.svelte';
	import { getCanvasContext } from './context.js';
	import { round, trimmedLine } from './geometry.js';
	import type { GraphEdge, GraphNode } from './types.js';

	interface Props {
		nodes: readonly GraphNode[];
		edges: readonly GraphEdge[];
		title: string;
	}

	let { nodes, edges, title }: Props = $props();

	const canvas = getCanvasContext();
	const NODE = 8;
	let byId = $derived(new Map(nodes.map((node) => [node.id, node])));
	let lines = $derived(
		edges.flatMap((edge) => {
			const from = byId.get(edge.from);
			const to = byId.get(edge.to);
			return from && to
				? [{ key: `${edge.from}-${edge.to}`, ends: trimmedLine(from, to, NODE) }]
				: [];
		})
	);
	const OFFSET = 10;
	function anchor(node: GraphNode): { x: number; y: number } {
		switch (node.side ?? 'left') {
			case 'right':
				return { x: node.x + OFFSET, y: node.y };
			case 'above':
				return { x: node.x, y: node.y - OFFSET };
			case 'below':
				return { x: node.x, y: node.y + OFFSET };
			default:
				return { x: node.x - OFFSET, y: node.y };
		}
	}
	let rows = $derived(nodes.map((node) => [node.label, (node.notes ?? []).join(' · ') || '–']));
</script>

<!-- DataViz.Graph: a computation graph. Nodes are squares, edges 1px, values stand beside them. -->
<svg class="figure-plate-layer" viewBox={canvas.viewBox} aria-hidden="true" focusable="false">
	{#each lines as line (line.key)}
		<line
			class="figure-plate-line"
			x1={round(line.ends[0].x)}
			y1={round(line.ends[0].y)}
			x2={round(line.ends[1].x)}
			y2={round(line.ends[1].y)}
			vector-effect="non-scaling-stroke"
		/>
	{/each}
	{#each nodes as node (node.id)}
		<rect
			class="figure-plate-node"
			data-accent={node.emphasis ? 'mark' : undefined}
			x={node.x - NODE / 2}
			y={node.y - NODE / 2}
			width={NODE}
			height={NODE}
			vector-effect="non-scaling-stroke"
		/>
	{/each}
</svg>
{#each nodes as node (node.id)}
	{@const at = anchor(node)}
	<Callout x={at.x} y={at.y} place={node.side ?? 'left'}>
		<span class="figure-plate-callout-line">{node.label}</span>
		{#each node.notes ?? [] as note, index (index)}
			<span class="figure-plate-callout-line" data-note>{note}</span>
		{/each}
	</Callout>
{/each}
<DataTable caption={title} columns={['Knoten', 'Werte']} {rows} />
