import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { bastaniPhases, effectLabel, productGraph, scaledSoftmax } =
	await import('./essay-figures.js');

test('Bastani phases distinguish a negative effect from an insignificant result', () => {
	assert.deepEqual(bastaniPhases.practice.effects.map(effectLabel), ['+48 %', '+127 %']);
	assert.deepEqual(bastaniPhases.test.effects.map(effectLabel), ['−17 %', 'n. s.']);
	assert.equal(bastaniPhases.test.effects[1], null);
});

test('unequal factors expose switched gradients that equal factors conceal', () => {
	assert.deepEqual(productGraph(2, -3), { product: -6, gradientA: -3, gradientB: 2 });
	assert.deepEqual(productGraph(3, 3), { product: 9, gradientA: 3, gradientB: 3 });
	assert.deepEqual(productGraph(-2, 0), { product: -0, gradientA: 0, gradientB: -2 });
});

test('softmax grows sharper with scaling while probabilities keep their order and sum to one', () => {
	let previous = 0;
	for (let factor = 1; factor <= 10; factor++) {
		const entries = scaledSoftmax(factor);
		const [first, second, third] = entries.map(({ probability }) => probability);
		assert.deepEqual(
			entries.map(({ logit }) => logit),
			[2 * factor, factor, 0]
		);
		assert.ok(first > second && second > third && third > 0);
		assert.ok(first > previous);
		assert.ok(Math.abs(first + second + third - 1) < 1e-12);
		previous = first;
	}
	assert.equal((scaledSoftmax(1)[0].probability * 100).toFixed(3), '66.524');
	assert.equal((scaledSoftmax(10)[0].probability * 100).toFixed(3), '99.995');
});
