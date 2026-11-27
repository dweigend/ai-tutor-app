/** Data shapes of the DataViz marks (ui/DESIGN.md §11 P7). Plain values, no content import. */

/** One bar. `display` is the value as the text states it; without it the bar carries no number. */
export interface BarDatum {
	label: string;
	/** Consecutive bars with the same group share one label under them. */
	group?: string;
	value: number;
	display?: string;
	/** Solid ink instead of an outline. */
	emphasis?: boolean;
	/** One of the two accents (DESIGN.md §5.2, §5.3). */
	accent?: 'mark' | 'grip';
}

/** A point of a curve in data units; a marked point gets a square and an optional label. */
export interface CurvePoint {
	x: number;
	y: number;
	label?: string;
}

/** One node of a computation graph, placed in viewBox units. */
export interface GraphNode {
	id: string;
	label: string;
	x: number;
	y: number;
	/** Lines under the label, e.g. value and gradient. */
	notes?: readonly string[];
	emphasis?: boolean;
	/** Which side of the square the words stand on. */
	side?: 'left' | 'right' | 'above' | 'below';
}

export interface GraphEdge {
	from: string;
	to: string;
}

/** One isometric layer, bottom to top. `size` is its side relative to the widest layer (0…1). */
export interface LayerDatum {
	label: string;
	size?: number;
	note?: string;
	emphasis?: boolean;
}
