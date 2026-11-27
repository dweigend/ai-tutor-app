import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'node:test';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const {
	computeAttentionDeckState: attention,
	computeBackpropDeckState: backprop,
	drawAttentionDeckFallback,
	drawBackpropDeckFallback
} = await import('./index.js');

describe('scaled dot-product attention', () => {
	it('normalizes every query and preserves each weighted value component', () => {
		for (let focusToken = 0; focusToken < 4; focusToken++) {
			for (const temperature of [0.5, 1, 2.5]) {
				const state = attention({ focusToken, temperature });
				assert.ok(Math.abs(state.weights.reduce((a, b) => a + b, 0) - 1) < 1e-12);
				assert.equal(state.weights.indexOf(Math.max(...state.weights)), focusToken);
				assert.deepEqual(
					state.context,
					[0, 1, 2].map((j) => state.contributions.reduce((sum, v) => sum + v[j], 0))
				);
			}
		}
	});
	it('halves four-dimensional scores and softens their peak', () => {
		const scaled = attention(),
			raw = attention({ scaleOn: false });
		assert.deepEqual(raw.logits, [5, 4, 1, 0]);
		assert.deepEqual(
			scaled.logits,
			raw.logits.map((x) => x / 2)
		);
		assert.ok(scaled.weights[0] < raw.weights[0]);
		assert.ok(
			attention({ temperature: 0.5 }).weights[0] > attention({ temperature: 2.5 }).weights[0]
		);
	});
	it('bounds controls and snapshots the matched terms', () => {
		const terms: ('Q' | 'V')[] = ['Q'];
		const s = attention({ slide: 9, focusToken: -1, temperature: 9, matchedTerms: terms });
		terms.push('V');
		assert.partialDeepStrictEqual(s, {
			slide: 4,
			focusToken: 0,
			temperature: 2.5,
			matchedTerms: ['Q']
		});
		assert.partialDeepStrictEqual(attention({ slide: NaN, focusToken: 15, temperature: 0 }), {
			slide: 0,
			focusToken: 3,
			temperature: 0.5
		});
	});
});
describe('two paths through the square', () => {
	it('accumulates both local derivatives before propagating', () => {
		assert.partialDeepStrictEqual(backprop(), {
			loss: 25,
			contributions: { left: 5, right: 5 },
			gradients: { a: 30, b: 20, c: 10, d: 10, L: 1 }
		});
		assert.partialDeepStrictEqual(backprop({ a: -2, b: 3, c: 1 }), {
			loss: 25,
			gradients: { a: -30, b: 20, c: -10 }
		});
		assert.partialDeepStrictEqual(backprop({ a: 0, c: 0 }), {
			loss: 0,
			gradients: { a: 0, b: 0, c: 0 }
		});
	});
	it('bounds the learning rate and distinguishes descent from overshoot', () => {
		const slow = backprop({ slide: -3, lr: -1 }),
			fast = backprop({ slide: 90, lr: 2 });
		assert.partialDeepStrictEqual(slow, { slide: 0, lr: 0.05 });
		assert.partialDeepStrictEqual(fast, { slide: 4, lr: 0.8 });
		assert.equal(slow.descent[1], 4.5);
		assert.ok(Math.abs(fast.descent[1] + 3) < 1e-12);
		assert.equal(backprop({ lr: 0.5 }).descent[1], 0);
	});
});
it('draws every static slide with finite canvas coordinates and labels', () => {
	for (const draw of [drawAttentionDeckFallback, drawBackpropDeckFallback]) {
		for (let slide = 0; slide < 5; slide++) {
			const labels: string[] = [];
			const ctx = new Proxy({} as Record<string, unknown>, {
				get:
					(_, method) =>
					(...args: unknown[]) => {
						for (const value of args)
							if (typeof value === 'number') assert.ok(Number.isFinite(value));
						if (method === 'fillText') labels.push(String(args[0]));
					}
			});
			const canvas = {
				width: 360,
				height: 200,
				getContext: () => ctx
			} as unknown as HTMLCanvasElement;
			draw(canvas, { slide });
			assert.ok(labels.length > 0);
		}
	}
});
