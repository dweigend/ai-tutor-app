import { VALLEY_KAPPA_Y } from '../figures/surface.js';
import { attentionTerms } from './attention-terms.js';
import type { FormulaNode } from './editorial-formulas.js';

export const scalingFormula: FormulaNode = {
	id: 'attention-skalierung',
	latex: String.raw`\div ${attentionTerms['sqrt-dk'].latex}`,
	spoken: 'geteilt durch die Wurzel aus d Index k'
};

export function reliefWeightsFormula(scaled: boolean): FormulaNode {
	const denominator = scaled ? `T${attentionTerms['sqrt-dk'].latex}` : 'T';
	return {
		id: scaled ? 'relief-gewichte-skaliert' : 'relief-gewichte',
		latex: String.raw`\operatorname{softmax}\!\left(\frac{Q K^{\mathsf{T}}}{${denominator}}\right)`,
		spoken: `Softmax von Q mal K transponiert, geteilt durch Temperatur T${scaled ? ' mal Wurzel aus d Index k' : ''}.`,
		interactiveTerms: scaled ? ['softmax', 'Q', 'KT', 'sqrt-dk'] : ['softmax', 'Q', 'KT']
	};
}

const yCurvature = VALLEY_KAPPA_Y.toLocaleString('de-DE');
export const valleyLossFormula: FormulaNode = {
	id: 'tal-verlust',
	latex: String.raw`f(x, y) = \kappa \cdot x^2 + ${yCurvature.replace(',', '{,}')} \cdot y^2`,
	spoken: `f von x und y gleich Kappa mal x Quadrat plus ${yCurvature} mal y Quadrat`
};
