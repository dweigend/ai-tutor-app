import type { InkColor } from './strokes.js';

export type BoardTool = 'pen' | 'eraser';

interface ToolSelection {
	tool: BoardTool;
	color: InkColor;
}

/** Choosing a color switches back to the pen. Choosing a tool keeps the last pen color. */
export function selectTool(
	current: ToolSelection,
	selection: { tool: BoardTool } | { color: InkColor }
): ToolSelection {
	if ('color' in selection) return { tool: 'pen', color: selection.color };
	return { ...current, tool: selection.tool };
}
