/**
 * DataViz marks for the FigurePlate: Bars (distribution), Curve (function with points and steps),
 * Matrix (heatmap, mask, learning state), Graph (computation graph), Layers (isometric layers).
 * Each draws into the surrounding Canvas and carries its data as a hidden table.
 */
export { default as Bars } from './Bars.svelte';
export { default as Curve } from './Curve.svelte';
export { default as Graph } from './Graph.svelte';
export { default as Layers } from './Layers.svelte';
export { default as Matrix } from './Matrix.svelte';
export type { BarDatum, CurvePoint, GraphEdge, GraphNode, LayerDatum } from './types.js';
