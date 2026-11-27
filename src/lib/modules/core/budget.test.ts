import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { BUDGET, countLines, evaluateBudget } = await import('./budget.js');

const LEAD = 23; // 20px Mono at line-height 1.15
const text = (lines: number, lineHeight = LEAD, clipped = false) => ({
	text: 'x',
	height: lines * lineHeight,
	lineHeight,
	clipped
});
const empty = { facts: [], overflow: [], hits: [] };

test('lines come from the rendered height, with rounding slack', () => {
	assert.equal(countLines(69, 23), 3);
	assert.equal(countLines(80, 23), 3);
	assert.equal(countLines(81, 23), 4);
	assert.equal(countLines(0, 23), 0);
	assert.equal(countLines(10, 23), 1);
});

test('a question of three lines passes, four lines warn', () => {
	assert.deepEqual(evaluateBudget({ ...empty, prompt: text(3) }), []);
	const [violation] = evaluateBudget({ ...empty, prompt: text(4) });
	assert.equal(violation.rule, 'prompt-lines');
	assert.equal(BUDGET.promptLines, 3);
});

test('context and every fact cell stay on one line and are never clipped', () => {
	assert.deepEqual(evaluateBudget({ ...empty, context: text(1, 16.5) }), []);
	assert.equal(evaluateBudget({ ...empty, context: text(2, 16.5) })[0].rule, 'context-lines');
	assert.equal(evaluateBudget({ ...empty, facts: [text(2, 19.5)] })[0].rule, 'fact-lines');
	assert.equal(evaluateBudget({ ...empty, facts: [text(1, 19.5, true)] })[0].rule, 'fact-lines');
});

test('overflow and scrolling are reported, one pixel of slack', () => {
	const fits = {
		name: 'Bühne',
		scrollHeight: 845,
		clientHeight: 844,
		scrollWidth: 391,
		clientWidth: 390
	};
	const runs = { name: 'Bühne', scrollHeight: 900, clientHeight: 844 };
	assert.deepEqual(evaluateBudget({ ...empty, overflow: [fits] }), []);
	assert.equal(evaluateBudget({ ...empty, overflow: [runs] })[0].rule, 'overflow');
	assert.match(
		evaluateBudget({ ...empty, overflow: [{ ...fits, scrollWidth: 392 }] })[0].message,
		/seitlich/
	);
});

test('targets need 44 × 44 px, a code line 32 px high', () => {
	const ok = { name: 'Festlegen', width: 390, height: 64 };
	const small = { name: 'x', width: 30, height: 30 };
	const codeLine = { name: 'Zeile 5', width: 358, height: 32, minHeight: BUDGET.codeLine };
	assert.deepEqual(evaluateBudget({ ...empty, hits: [ok, codeLine] }), []);
	assert.equal(evaluateBudget({ ...empty, hits: [small] })[0].rule, 'hit');
});
