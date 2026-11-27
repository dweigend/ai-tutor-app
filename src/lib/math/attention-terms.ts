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

/** The five terms the 3D attention deck knows (`AttentionTerm` of the figure library). */
export type DeckTerm = 'Q' | 'K' | 'V' | 'dk' | 'softmax';

/** Deck terms name the same things as the help terms above. */
export const deckTermIds = {
	Q: 'Q',
	K: 'KT',
	V: 'V',
	dk: 'sqrt-dk',
	softmax: 'softmax'
} as const satisfies Record<DeckTerm, AttentionTermId>;

export interface AttentionBubble {
	term: DeckTerm;
	/** What stands on the bubble, in RichText notation (`d_{k}`). */
	label: string;
	spoken: string;
	/** The short meaning on its slot. */
	meaning: string;
	/** Shown after a wrong drop: points back into the formula, never gives a verdict. */
	hint: string;
}

/** Bubbles of the matching slide, in the order they stand on the left. */
export const attentionBubbles: readonly AttentionBubble[] = [
	{
		term: 'Q',
		label: 'Q',
		spoken: attentionTerms.Q.spoken,
		meaning: 'Was ein Wort sucht',
		hint: 'Noch nicht – Q stellt die Suchanfrage.'
	},
	{
		term: 'K',
		label: 'K',
		spoken: 'Keys K',
		meaning: 'Was jedes Wort anbietet',
		hint: 'Noch nicht – K ist das Etikett jedes Worts.'
	},
	{
		term: 'V',
		label: 'V',
		spoken: attentionTerms.V.spoken,
		meaning: 'Inhalt, der gemischt wird',
		hint: 'Noch nicht – V liefert am Ende den Inhalt.'
	},
	{
		term: 'dk',
		label: '√d_{k}',
		spoken: attentionTerms['sqrt-dk'].spoken,
		meaning: 'Bremst zu große Werte',
		hint: 'Noch nicht – die Wurzel teilt unter dem Bruchstrich.'
	},
	{
		term: 'softmax',
		// σ is the short sign of the softmax, so all five bubbles are circles of one size.
		label: 'σ',
		spoken: attentionTerms.softmax.spoken,
		meaning: 'Normiert alles auf 100\u00a0%',
		hint: 'Noch nicht – σ, die Softmax, normiert die Klammer auf 1.'
	}
];

/** Slots on the right stand in another order, so no bubble faces its own meaning. */
export const attentionSlotOrder: readonly DeckTerm[] = ['V', 'softmax', 'dk', 'K', 'Q'];

/** Attention formula with every deck term marked for highlighting (KaTeX `\htmlData`). */
export const attentionDeckLatex = String.raw`\operatorname{Attention}(\htmlData{term=Q}{Q}, \htmlData{term=K}{K}, \htmlData{term=V}{V}) = \htmlData{term=softmax}{\operatorname{softmax}}\!\left(\frac{\htmlData{term=Q}{Q}\,\htmlData{term=K}{K^{\mathsf{T}}}}{\htmlData{term=dk}{\sqrt{d_k}}}\right) \htmlData{term=V}{V}`;
