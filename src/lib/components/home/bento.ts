/**
 * The bento templates of the start page (issue #58): every tile count fills exactly one screen
 * with large, wide, tall and compact blocks. A letter is one tile in the order of the board,
 * `t` is the day tile. It always holds the bottom right corner, so the corner duck never
 * covers a label.
 */
export type Format = 'portrait' | 'landscape';

export const MIN_TILES = 6;
export const MAX_TILES = 8;

const DAY = 't';

const TEMPLATES: Record<Format, Record<number, readonly string[]>> = {
	portrait: {
		6: [
			'aaaaaa',
			'aaaaaa',
			'aaaaaa',
			'aaaaaa',
			'bbbbcc',
			'bbbbcc',
			'bbbbcc',
			'ddddcc',
			'ddddcc',
			'eeettt',
			'eeettt',
			'eeettt'
		],
		7: [
			'aaaaaa',
			'aaaaaa',
			'aaaaaa',
			'bbbbcc',
			'bbbbcc',
			'bbbbcc',
			'bbbbcc',
			'dddeee',
			'dddeee',
			'fffttt',
			'fffttt',
			'fffttt'
		],
		8: [
			'aaaaaa',
			'aaaaaa',
			'aaaaaa',
			'bbbccc',
			'bbbccc',
			'bbbccc',
			'ddddee',
			'ddddee',
			'ffffee',
			'ffffee',
			'gggttt',
			'gggttt'
		]
	},
	landscape: {
		6: [
			'aaaaabbbbccc',
			'aaaaabbbbccc',
			'aaaaabbbbccc',
			'aaaaaddddccc',
			'eeeeeddddttt',
			'eeeeeddddttt'
		],
		7: [
			'aaaaabbbbccc',
			'aaaaabbbbccc',
			'aaaaabbbbccc',
			'aaaaaddeeccc',
			'fffffddeettt',
			'fffffddeettt'
		],
		8: [
			'aaaaabbbbccc',
			'aaaaabbbbccc',
			'aaaaabbbbccc',
			'aaaaaddeefff',
			'gggggddeettt',
			'gggggddeettt'
		]
	}
};

export interface Cell {
	/** First grid line of the cell, counted from 1. */
	column: number;
	row: number;
	columns: number;
	rows: number;
	/** The cell touches the top or the left edge of the screen (safe area of its label). */
	top: boolean;
	left: boolean;
}

export interface Bento {
	columns: number;
	rows: number;
	/** One cell per tile in board order; the last one is the day tile. */
	cells: readonly Cell[];
}

function cellOf(template: readonly string[], letter: string): Cell {
	const rows = template.flatMap((line, index) => (line.includes(letter) ? [index] : []));
	const first = template[rows[0]];
	const column = first.indexOf(letter);
	return {
		column: column + 1,
		row: rows[0] + 1,
		columns: first.lastIndexOf(letter) - column + 1,
		rows: rows.length,
		top: rows[0] === 0,
		left: column === 0
	};
}

/** The template for `count` tiles including the day tile; counts outside the range are clamped. */
export function bento(count: number, format: Format): Bento {
	const tiles = Math.min(MAX_TILES, Math.max(MIN_TILES, Math.trunc(count)));
	const template = TEMPLATES[format][tiles];
	const letters = [...new Set(template.join(''))].filter((letter) => letter !== DAY).sort();
	return {
		columns: template[0].length,
		rows: template.length,
		cells: [...letters, DAY].map((letter) => cellOf(template, letter))
	};
}

/** `grid-area` shorthand of a cell. */
export function gridArea({ row, column, rows, columns }: Cell): string {
	return `${row} / ${column} / span ${rows} / span ${columns}`;
}
