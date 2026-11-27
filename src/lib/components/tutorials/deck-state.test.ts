import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// `npx vitest` and `node --test` both run this file: take the runner that is there.
const runner: string = process.env.VITEST ? 'vitest' : 'node:test';
const { describe, it }: Pick<typeof import('node:test'), 'describe' | 'it'> = await import(runner);
const lib = new URL('../../', import.meta.url).href;
// Bundler imports use .js specifiers. Node resolves them to the TypeScript sources.
const hooks = process.env.VITEST
	? null
	: registerHooks({
			resolve(specifier, context, nextResolve) {
				const own = context.parentURL?.startsWith(lib) && /^\.\.?\/.*\.js$/.test(specifier);
				return nextResolve(own ? specifier.replace(/\.js$/, '.ts') : specifier, context);
			}
		});
const {
	SWIPE_DISTANCE,
	clampPlace,
	cycle,
	descentOutcome,
	isTap,
	largerGradient,
	parsePlace,
	stepPlace,
	swipeStep
} = await import('./deck-state.js');
const { computeBackpropDeckState } = await import('../../figures/index.js');
const { explainDecks } = await import('../../content/tutorials.js');
hooks?.deregister();

const lengths = [5, 5];

describe('place in the decks', () => {
	it('walks through one deck, on into the next and holds at both ends', () => {
		assert.deepEqual(stepPlace({ deck: 0, slide: 0 }, 1, lengths), { deck: 0, slide: 1 });
		assert.deepEqual(stepPlace({ deck: 0, slide: 4 }, 1, lengths), { deck: 1, slide: 0 });
		assert.deepEqual(stepPlace({ deck: 1, slide: 0 }, -1, lengths), { deck: 0, slide: 4 });
		assert.deepEqual(stepPlace({ deck: 0, slide: 0 }, -1, lengths), { deck: 0, slide: 0 });
		assert.deepEqual(stepPlace({ deck: 1, slide: 4 }, 1, lengths), { deck: 1, slide: 4 });
		let place = { deck: 0, slide: 0 };
		for (let index = 0; index < 20; index++) place = stepPlace(place, 1, lengths);
		assert.deepEqual(place, { deck: 1, slide: 4 });
	});

	it('clamps a place that lies outside', () => {
		assert.deepEqual(clampPlace({ deck: 7, slide: 9 }, lengths), { deck: 1, slide: 4 });
		assert.deepEqual(clampPlace({ deck: -1, slide: NaN }, lengths), { deck: 0, slide: 0 });
		assert.deepEqual(clampPlace({ deck: 0, slide: 2.4 }, lengths), { deck: 0, slide: 2 });
	});

	it('reads a deep link and refuses what does not exist', () => {
		assert.deepEqual(parsePlace('#attention-5', explainDecks), { deck: 0, slide: 4 });
		assert.deepEqual(parsePlace('#backprop', explainDecks), { deck: 1, slide: 0 });
		assert.deepEqual(parsePlace('backprop-3', explainDecks), { deck: 1, slide: 2 });
		for (const hash of ['', '#', '#attention-0', '#attention-6', '#valley-1', '#attention-x']) {
			assert.equal(parsePlace(hash, explainDecks), null, hash);
		}
	});
});

describe('gestures', () => {
	it('a sideways swipe turns the slide, a short or steep one does not', () => {
		assert.equal(swipeStep(-SWIPE_DISTANCE, 0), 1);
		assert.equal(swipeStep(SWIPE_DISTANCE, 10), -1);
		assert.equal(swipeStep(-(SWIPE_DISTANCE - 1), 0), 0);
		assert.equal(swipeStep(-80, 70), 0);
		assert.equal(swipeStep(0, 200), 0);
	});

	it('a tap is short and stays in place', () => {
		assert.equal(isTap(2, 3, 120), true);
		assert.equal(isTap(12, 0, 120), false);
		assert.equal(isTap(0, 0, 900), false);
	});

	it('tapping the figure walks on and wraps', () => {
		assert.deepEqual(
			[0, 1, 2, 3].map((index) => cycle(index, 4)),
			[1, 2, 3, 0]
		);
		assert.equal(cycle(5, 6), 0);
		assert.equal(cycle(0, 0), 0);
	});
});

describe('judgements of the backprop deck', () => {
	it('the valley challenge follows the gradient steps of the scene', () => {
		const outcome = (lr: number) => descentOutcome(computeBackpropDeckState({ lr }).descent);
		assert.equal(outcome(0.05), 'short');
		assert.equal(outcome(0.15), 'short');
		assert.equal(outcome(0.2), 'landed');
		assert.equal(outcome(0.5), 'landed');
		assert.equal(outcome(0.55), 'overshoot');
		assert.equal(outcome(0.8), 'overshoot');
	});

	it('judges plain step rows', () => {
		assert.equal(descentOutcome([]), 'short');
		assert.equal(descentOutcome([4, 2, 1]), 'short');
		assert.equal(descentOutcome([4, 0, 0]), 'landed');
		assert.equal(descentOutcome([-4, -0.02]), 'landed');
		assert.equal(descentOutcome([4, -1, 0.25]), 'overshoot');
		assert.equal(descentOutcome([0, 0]), 'landed');
	});

	it('names the branch with the larger gradient', () => {
		const { gradients } = computeBackpropDeckState();
		assert.deepEqual([gradients.a, gradients.b], [30, 20]);
		assert.equal(largerGradient(gradients), 'a');
		assert.equal(largerGradient({ a: -4, b: 9 }), 'b');
		assert.equal(largerGradient({ a: 6, b: -6 }), null);
		assert.equal(largerGradient({ a: 0, b: 0 }), null);
	});
});

describe('deck content', () => {
	it('holds two decks of five slides with one control each', () => {
		assert.deepEqual(
			explainDecks.map((deck) => [deck.id, deck.slides.length]),
			[
				['attention', 5],
				['backprop', 5]
			]
		);
		for (const deck of explainDecks) {
			assert.equal(new Set(deck.slides.map((slide) => slide.id)).size, deck.slides.length);
			for (const slide of deck.slides) {
				// One short line: the budget of a lead question (DESIGN.md §10.1), no shouting.
				assert.ok(slide.headline.length <= 70, slide.headline);
				assert.doesNotMatch(slide.headline, /!/);
				const { control } = slide;
				if (control.kind === 'range') {
					assert.ok(control.min < control.max && control.step > 0, slide.id);
				}
				if (control.kind === 'pick') assert.ok(control.options.length >= 2, slide.id);
			}
		}
		assert.equal(explainDecks[0].slides[4].control.kind, 'bubbles');
		assert.ok(explainDecks[1].slides.every((slide) => slide.formula));
		const lr = explainDecks[1].slides[4].control;
		assert.ok(lr.kind === 'range' && lr.min === 0.05 && lr.max === 0.8 && lr.challenge);
	});
});
