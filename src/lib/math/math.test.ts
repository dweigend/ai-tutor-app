import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import katex from 'katex';
const lib = new URL('../', import.meta.url).href;
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.startsWith(lib) &&
			specifier.startsWith('.') &&
			specifier.endsWith('.js')
		) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});
const { markdownSpoken, parseMarkdown } = await import('../components/tutorials/markdown.js');
const { attentionOccurrences, attentionTerms, termPills } = await import('./attention-terms.js');
const { editorialFormulas, formulaRef, splitFormulas } = await import('./editorial-formulas.js');
const { katexOptions } = await import('./katex-render.js');
const { reliefWeightsFormula, scalingFormula, valleyLossFormula } =
	await import('./lab-formulas.js');
hooks.deregister();

for (const { id, latex, spoken } of [
	...editorialFormulas.values(),
	scalingFormula,
	reliefWeightsFormula(false),
	reliefWeightsFormula(true),
	valleyLossFormula
]) {
	test(`redaktionelle Formel ${id}`, () => {
		const html = katex.renderToString(latex, {
			...katexOptions,
			strict: 'warn',
			throwOnError: true
		});
		assert.match(html, /<math[ >]/);
		assert.ok(spoken.length > 0);
	});
}

test('explicit formula references work inline and in a display; backticks stay code', () => {
	const ref = formulaRef('gd-parabel');
	const formula = editorialFormulas.get('gd-parabel');
	assert.deepEqual(parseMarkdown(ref), [{ kind: 'formula', formula }]);
	assert.deepEqual(splitFormulas(`Für ${ref} gilt`), [
		{ kind: 'text', text: 'Für ' },
		{ kind: 'formula', formula },
		{ kind: 'text', text: ' gilt' }
	]);
	assert.deepEqual(parseMarkdown(`\`${ref}\``), [
		{ kind: 'paragraph', inlines: [{ kind: 'code', text: ref }] }
	]);
});

test('ReadAloud reads the editorial wording once, including inline formulas', () => {
	const spoken = markdownSpoken(
		`Die Formel.\n\n${formulaRef('attention-formel')}\n\nDie Ableitung ist ${formulaRef('softmax-ableitung')}.`
	);
	assert.equal(
		spoken,
		'Die Formel. Attention von Q, K und V ist gleich Softmax von Q mal K transponiert geteilt durch Wurzel aus d Index k, multipliziert mit V. Die Ableitung ist p mal, in Klammern, eins minus p.'
	);
});

test('every help term has exactly one pill, in formula order, and appears in the formula', () => {
	const formula = editorialFormulas.get('attention-formel')!;
	const pills = termPills(formula.interactiveTerms);
	assert.deepEqual(pills, ['Q', 'KT', 'V', 'softmax', 'sqrt-dk']);
	assert.deepEqual(
		pills.map((termId) => attentionTerms[termId].label),
		['Q', 'K\u1d40', 'V', 'softmax', '\u221ad\u2096']
	);
	assert.deepEqual([...pills].sort(), Object.keys(attentionTerms).sort());
	assert.equal(new Set(attentionOccurrences).size, attentionOccurrences.length);
	// A formula that repeats a term or names them in another order still gets one calm row.
	assert.deepEqual(termPills(['softmax', 'Q', 'V', 'Q', 'KT', 'sqrt-dk', 'V']), pills);
	assert.deepEqual(termPills(reliefWeightsFormula(true).interactiveTerms), [
		'Q',
		'KT',
		'softmax',
		'sqrt-dk'
	]);
	assert.deepEqual(termPills(undefined), []);
	for (const term of Object.values(attentionTerms)) {
		assert.ok(formula.latex.includes(term.latex));
		assert.match(
			katex.renderToString(term.latex, { ...katexOptions, strict: 'warn' }),
			/<math[ >]/
		);
	}
});
