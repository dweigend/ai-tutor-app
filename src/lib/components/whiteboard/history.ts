import type { Stroke } from './strokes.js';

// Enough steps to undo a whole sketch session without holding unbounded copies.
const HISTORY_LIMIT = 100;

export interface EditHistory {
	undo: Stroke[][];
	redo: Stroke[][];
}

export function rememberEdit(history: EditHistory, strokes: Stroke[]): EditHistory {
	return { undo: [...history.undo, strokes].slice(-HISTORY_LIMIT), redo: [] };
}

export function stepEdit(history: EditHistory, strokes: Stroke[], direction: keyof EditHistory) {
	const next = history[direction].at(-1);
	if (!next) return null;
	const reverse = direction === 'undo' ? 'redo' : 'undo';
	return {
		strokes: next,
		history: {
			...history,
			[direction]: history[direction].slice(0, -1),
			[reverse]: [...history[reverse], strokes]
		}
	};
}
