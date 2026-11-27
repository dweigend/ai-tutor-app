import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('./') && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { VALLEY_MARK_COUNT, comparisonValleys, gradientSteps, valley } =
	await import('./surface.js');

test('exercise 1.6 marks follow both exact gradient recurrences from (1, 1)', () => {
	const tolerance = 1e-9;
	const [gentle, steep] = comparisonValleys();
	for (const [params, yFactor] of [
		[gentle, 0.83],
		[steep, -0.7]
	] as const) {
		assert.deepEqual(params.start, { x: 1, y: 1 });
		assert.equal(params.eta, 0.085);
		const marks = gradientSteps(valley(params), params.start, params.eta, VALLEY_MARK_COUNT);
		assert.equal(marks.length, 9);
		for (const [index, mark] of marks.entries()) {
			assert.ok(Math.abs(mark.x - 0.83 ** index) < tolerance, `x at step ${index}`);
			assert.ok(Math.abs(mark.y - yFactor ** index) < tolerance, `y at step ${index}`);
		}
	}
});
