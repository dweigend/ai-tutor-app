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

const { FALL, blockOffset, fallFrom, stepFall, wushAction } = await import('./block-physics.js');

const BOUNDS = { left: 0, right: 390 };

/** Runs a fall at a frame rate until it rests; returns the path and the highest rebound. */
function run(height: number, fps: number) {
	let state = fallFrom(height);
	let seconds = 0;
	let rebound = 0;
	let landedAt: number | undefined;
	while (!state.resting && seconds < 5) {
		state = stepFall(state, 1 / fps);
		seconds += 1 / fps;
		if (state.impacts > 0) {
			landedAt ??= seconds;
			rebound = Math.max(rebound, -state.offset);
		}
	}
	return { state, seconds, rebound, landedAt: landedAt ?? Number.NaN };
}

test('a block falls faster and faster and never below its place', () => {
	let state = fallFrom(600);
	let lastSpeed = 0;
	while (state.impacts === 0) {
		state = stepFall(state, 1 / 240);
		assert.ok(state.offset <= 0);
		if (state.impacts === 0) assert.ok(state.velocity > lastSpeed);
		lastSpeed = state.velocity;
	}
});

test('a drop across a phone screen takes under half a second and comes to rest', () => {
	const { state, seconds, landedAt } = run(844, 60);
	assert.ok(landedAt > 0.35 && landedAt < 0.5, `landed after ${landedAt}s`);
	assert.ok(seconds < 0.75, `rested after ${seconds}s`);
	assert.deepEqual(
		{ offset: state.offset, velocity: state.velocity, resting: state.resting },
		{ offset: 0, velocity: 0, resting: true }
	);
});

test('the block rebounds once, by at most 4 % of the drop height', () => {
	for (const height of [300, 568, 844]) {
		const { state, rebound } = run(height, 120);
		assert.ok(rebound > height * 0.02, `${height}: rebound ${rebound}`);
		assert.ok(rebound <= height * 0.04 + 1, `${height}: rebound ${rebound}`);
		assert.equal(state.impacts, 2, `${height}`);
	}
});

test('a short drop lands without a rebound', () => {
	const { state, rebound } = run(40, 120);
	assert.equal(state.impacts, 1);
	assert.equal(rebound, 0);
});

test('a fall does not depend on the frame rate', () => {
	const slow = run(700, 60);
	const fast = run(700, 120);
	assert.ok(Math.abs(slow.landedAt - fast.landedAt) <= 1 / 60);
	assert.ok(Math.abs(slow.rebound - fast.rebound) < 1);
	assert.equal(slow.state.impacts, fast.state.impacts);
});

test('a block without height rests at once', () => {
	assert.equal(fallFrom(0).resting, true);
	assert.deepEqual(stepFall(fallFrom(-5), 1), fallFrom(0));
	assert.ok(FALL.restitution <= 0.2);
});

test('a lifted block follows the finger and eases into the screen edge', () => {
	const start = { x: 195, y: 400 };
	assert.deepEqual(blockOffset(start, { x: 235, y: 380 }, BOUNDS, false), { x: 40, y: -20 });
	const far = blockOffset(start, { x: 390, y: 400 }, BOUNDS, false);
	assert.ok(far.x > 127 && far.x < 195);
});

test('the day tile only gives way a little', () => {
	const offset = blockOffset({ x: 300, y: 700 }, { x: 0, y: 700 }, BOUNDS, true);
	assert.ok(offset.x > -45 && offset.x < 0);
});

test('a tile leaves only when it reaches a side on purpose or is flung outward', () => {
	const start = { x: 195, y: 400 };
	const still = { x: 0, y: 0 };
	assert.equal(wushAction(start, { x: 380, y: 400 }, still, BOUNDS, false), 'later');
	assert.equal(wushAction(start, { x: 10, y: 400 }, still, BOUNDS, false), 'dismiss');
	assert.equal(wushAction(start, { x: 300, y: 400 }, still, BOUNDS, false), undefined);
	assert.equal(wushAction(start, { x: 340, y: 400 }, { x: 900, y: 0 }, BOUNDS, false), 'later');
	assert.equal(wushAction(start, { x: 380, y: 400 }, still, BOUNDS, true), undefined);
	assert.equal(wushAction(start, { x: 215, y: 700 }, still, BOUNDS, false), undefined);
});
