/** Data shapes of the readouts (ui/DESIGN.md §11 P6). Plain values, no content import. */

/** One fact cell: a label (Mono 11) over a value (Mono 17). Both stay on one line. */
export interface Fact {
	label: string;
	value: string;
}

/** One side of a pair A/B: key letter, a short label such as `η 0,25`, and the value. */
export interface PairSide {
	key: string;
	label: string;
	value: string;
}

/** One side of a code pair: key letter and a short program, shown line by line. */
export interface CodeSide {
	key: string;
	code: string;
}

/** The facts strip of a stage: at most four cells, or a pair A/B (DESIGN.md §10.1). */
export type FactsData =
	| { kind: 'cells'; cells: readonly Fact[] }
	| { kind: 'pair'; sides: readonly [PairSide, PairSide] }
	| { kind: 'code'; sides: readonly [CodeSide, CodeSide] };

/** What a finding says: matches, partly, deviates, or could not be judged. Never "falsch". */
export type Finding = 'match' | 'partial' | 'deviates' | 'open';
