export const attentionTerms = {
	Q: {
		label: 'Q',
		latex: 'Q',
		spoken: 'Queries Q',
		explanation:
			'Queries sind die Suchanfragen: Jede Position formuliert als Vektor, wonach sie im Kontext Ausschau hält.'
	},
	KT: {
		label: 'Kᵀ',
		latex: String.raw`K^{\mathsf{T}}`,
		spoken: 'Keys K transponiert',
		explanation:
			'Keys sind die Merkmals-Etiketten aller Positionen. Transponiert man sie, liefert das Produkt mit Q für jedes Paar einen Vergleichswert.'
	},
	'sqrt-dk': {
		label: '√dₖ',
		latex: String.raw`\sqrt{d_k}`,
		spoken: 'Wurzel aus d Index k',
		explanation:
			'Teilt die Vergleichswerte durch die Wurzel der Vektorlänge, damit die Abstände nicht mitwachsen und die Softmax beweglich bleibt.'
	},
	softmax: {
		label: 'softmax',
		latex: String.raw`\operatorname{softmax}`,
		spoken: 'Softmax',
		explanation:
			'Verwandelt eine Zeile beliebiger Vergleichswerte in positive Gewichte, die sich genau zu eins addieren.'
	},
	V: {
		label: 'V',
		latex: 'V',
		spoken: 'Values V',
		explanation:
			'Values tragen den eigentlichen Inhalt jeder Position, der anschließend nach den berechneten Anteilen zusammengemischt wird.'
	}
} as const;

export type AttentionTermId = keyof typeof attentionTerms;
export type FormulaSelection = {
	formulaId: string;
	formulaLatex: string;
	termId: AttentionTermId;
	termLabel: string;
};

// Each explainable term once, in the order of its pill: the three inputs, then what is done to them.
export const attentionOccurrences = [
	'Q',
	'KT',
	'V',
	'softmax',
	'sqrt-dk'
] as const satisfies readonly AttentionTermId[];

/** The pills of a formula: every term it names once, in the order above. */
export function termPills(terms: readonly AttentionTermId[] = []): AttentionTermId[] {
	return attentionOccurrences.filter((termId) => terms.includes(termId));
}
