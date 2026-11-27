import { attentionOccurrences, type AttentionTermId } from './attention-terms.js';

export interface FormulaNode {
	id: string;
	latex: string;
	spoken: string;
	interactiveTerms?: readonly AttentionTermId[];
}

const formulas = {
	'attention-formel': {
		latex: String.raw`\operatorname{Attention}(Q, K, V) = \operatorname{softmax}\!\left(\frac{Q K^{\mathsf{T}}}{\sqrt{d_k}}\right) V`,
		spoken:
			'Attention von Q, K und V ist gleich Softmax von Q mal K transponiert geteilt durch Wurzel aus d Index k, multipliziert mit V.',
		interactiveTerms: attentionOccurrences
	},
	'softmax-ableitung': {
		latex: String.raw`p \cdot (1 - p)`,
		spoken: 'p mal, in Klammern, eins minus p'
	},
	'sampling-temperatur': {
		latex: String.raw`p = \operatorname{softmax}\!\left(\frac{z}{T}\right)`,
		spoken: 'p gleich Softmax von z geteilt durch Temperatur T'
	},
	'key-dimension': { latex: 'd_k', spoken: 'd Index k' },
	'key-root': { latex: String.raw`\sqrt{d_k}`, spoken: 'Wurzel aus d Index k' },
	'backprop-parallel': { latex: String.raw`L = a \cdot b`, spoken: 'L gleich a mal b' },
	'backprop-hauptgraph': {
		latex: String.raw`L = (a \cdot b + c)^2`,
		spoken: 'L gleich, in Klammern, a mal b plus c, Klammer zu, zum Quadrat'
	},
	'backprop-kettenregel': {
		latex: String.raw`a.\text{grad} = d.\text{grad} \cdot \frac{\partial d}{\partial e} \cdot \frac{\partial e}{\partial a} = 8 \cdot 1 \cdot b = -24`,
		spoken:
			'a Punkt grad ist gleich d Punkt grad mal partielle Ableitung von d nach e mal partielle Ableitung von e nach a, also acht mal eins mal b, gleich minus vierundzwanzig.'
	},
	'gd-update': {
		latex: String.raw`w \leftarrow w - \eta \cdot \text{grad}`,
		spoken: 'w wird ersetzt durch w minus Lernrate eta mal Gradient'
	},
	'gd-parabel': {
		latex: 'f(w) = (w - 3)^2',
		spoken: 'f von w gleich, in Klammern, w minus drei, zum Quadrat'
	},
	'gd-faktor': { latex: String.raw`1 - 2\eta`, spoken: 'eins minus zwei eta' },
	'backprop-quadrat': { latex: String.raw`L = d \cdot d`, spoken: 'L gleich d mal d' },
	'gd-landschaften': {
		latex: String.raw`f = x^2 + y^2,\quad g = x^2 + 10y^2`,
		spoken: 'f gleich x Quadrat plus y Quadrat, g gleich x Quadrat plus zehn y Quadrat'
	},
	'gd-landschaft-faktor': {
		latex: String.raw`1 - 20\eta`,
		spoken: 'eins minus zwanzig eta'
	},
	'preis-kette': {
		latex: String.raw`P = (E \cdot (1 + s) + v) \cdot (1 + m)`,
		spoken: 'P gleich, in Klammern, E mal eins plus s, plus v, Klammer zu, mal eins plus m'
	},
	'gd-probe': {
		latex: 'L(w) = (2w - 4)^2',
		spoken: 'L von w gleich zwei w minus vier, zum Quadrat'
	}
} satisfies Record<string, Omit<FormulaNode, 'id'>>;

export const editorialFormulas: ReadonlyMap<string, FormulaNode> = new Map(
	Object.entries(formulas).map(([id, formula]) => [id, { id, ...formula }])
);

type FormulaId = keyof typeof formulas;

export function formulaRef(id: FormulaId): string {
	return `{{math:${id}}}`;
}

export const formulaRefPattern = String.raw`\{\{math:([\w-]+)\}\}`;

export type FormulaRun = { kind: 'text'; text: string } | { kind: 'formula'; formula: FormulaNode };

export function splitFormulas(source: string): FormulaRun[] {
	return source.split(new RegExp(formulaRefPattern, 'g')).flatMap((token, index): FormulaRun[] => {
		if (index % 2 === 0) return token ? [{ kind: 'text', text: token }] : [];
		const formula = editorialFormulas.get(token);
		return formula ? [{ kind: 'formula', formula }] : [{ kind: 'text', text: `{{math:${token}}}` }];
	});
}
