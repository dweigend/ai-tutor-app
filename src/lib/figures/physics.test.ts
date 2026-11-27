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

const { BallIntegrator, PHYSICS_HZ, simulate } = await import('./physics.js');
const { attentionWeights, diverges, gradientSteps, sampleGrid, softmax, stepFactor, valley } =
	await import('./surface.js');

const START = { x: 1.2, y: 1.05 };
const SECONDS = 6;

/** Positions at the common frame times of 30 Hz (every 1/30 s). */
function at30(frames: { t: number; x: number; y: number }[], hz: number) {
	const every = hz / 30;
	return frames.filter((_, index) => (index + 1) % every === 0).map(({ x, y }) => ({ x, y }));
}

test('free roll: 30, 60 and 120 Hz give exactly the same path', () => {
	const fn = valley({ kappa: 1 });
	const runs = [30, 60, 120].map((hz) => simulate(fn, START, { hz, seconds: SECONDS }));
	const paths = runs.map((run, index) => at30(run.frames, [30, 60, 120][index]));
	assert.equal(paths[0].length, SECONDS * 30);
	assert.deepStrictEqual(paths[1], paths[0]);
	assert.deepStrictEqual(paths[2], paths[0]);
	// The recorded step trail is identical as well, sample by sample.
	assert.deepStrictEqual(runs[1].integrator.trace, runs[0].integrator.trace);
	assert.deepStrictEqual(runs[2].integrator.trace, runs[0].integrator.trace);
	assert.equal(runs[0].integrator.tick, SECONDS * PHYSICS_HZ);
});

test('guided roll from mark to mark: frame-rate independent too', () => {
	const fn = valley({ kappa: 1 });
	const marks = gradientSteps(fn, START, 0.25, 6);
	const runs = [30, 60, 120].map((hz) => simulate(fn, START, { hz, seconds: SECONDS, marks }));
	const paths = runs.map((run, index) => at30(run.frames, [30, 60, 120][index]));
	assert.deepStrictEqual(paths[1], paths[0]);
	assert.deepStrictEqual(paths[2], paths[0]);
	assert.deepStrictEqual(runs[2].integrator.trace, runs[0].integrator.trace);
});

test('uneven frame times run the same steps as even ones', () => {
	const fn = valley({ kappa: 0.8 });
	const even = new BallIntegrator(fn, START);
	const uneven = new BallIntegrator(fn, START);
	const times = [0.013, 0.031, 0.05, 0.2, 0.2, 0.71, 1.4, 2.999, 3];
	for (const t of times) uneven.advanceTo(t);
	even.advanceTo(3);
	assert.deepStrictEqual(uneven.current, even.current);
	assert.deepStrictEqual(uneven.trace, even.trace);
});

test('the ball rolls with momentum into the valley and comes to rest', () => {
	const fn = valley({ kappa: 1 });
	const { frames, integrator } = simulate(fn, START, { hz: 60, seconds: 20 });
	// Schwung: it overshoots the bottom at least once (x changes sign).
	assert.ok(frames.some((frame) => frame.x < 0));
	const end = integrator.current;
	assert.ok(Math.hypot(end.x, end.y) < 0.05, `rests near the minimum, got ${end.x}, ${end.y}`);
	assert.ok(integrator.resting);
	// It never leaves the shown square.
	assert.ok(
		frames.every((frame) => Math.abs(frame.x) <= fn.extent && Math.abs(frame.y) <= fn.extent)
	);
});

test('marks are the exact gradient steps (DESIGN.md §9.3b, tolerance 1e-9)', () => {
	for (const [eta, kappa] of [
		[0.25, 1],
		[1, 1],
		[0.1, 1.5],
		[0.8, 0.4]
	]) {
		const fn = valley({ kappa });
		const steps = gradientSteps(fn, START, eta, 8);
		steps.forEach((step, k) => {
			const expectedX = START.x * stepFactor(eta, kappa) ** k;
			const expectedY = START.y * stepFactor(eta, 0.35) ** k;
			assert.ok(Math.abs(step.x - expectedX) < 1e-9, `x_${k} for η ${eta}, κ ${kappa}`);
			assert.ok(Math.abs(step.y - expectedY) < 1e-9, `y_${k} for η ${eta}, κ ${kappa}`);
		});
	}
	// Tutorial case f(w) = (w − 3)²: factor 1 − 2η, η 0,25 halves the distance.
	assert.equal(stepFactor(0.25, 1), 0.5);
	assert.equal(stepFactor(1, 1), -1);
	assert.equal(diverges(1, 1), false);
	assert.equal(diverges(1.5, 1), true);
});

test('one surface function feeds the grid samples', () => {
	const fn = valley({ kappa: 1 });
	const grid = sampleGrid(fn, 21);
	assert.equal(grid.length, 21);
	assert.equal(grid[0].length, 21);
	assert.equal(grid[10][10].z, 0);
	assert.equal(grid[0][0].z, fn.height(-1.5, -1.5));
});

test('softmax with temperature and the causal mask', () => {
	const weights = softmax([2, 1, 0]);
	assert.ok(Math.abs(weights.reduce((a, b) => a + b) - 1) < 1e-12);
	assert.ok(weights[0] > weights[1] && weights[1] > weights[2]);
	const hot = softmax([2, 1, 0], 4);
	assert.ok(hot[0] < weights[0], 'higher T flattens');
	const causal = attentionWeights(
		[
			[1, 5, 5],
			[1, 2, 5],
			[1, 2, 3]
		],
		{ temperature: 1, scaled: false, keyDimension: 1 }
	);
	assert.deepStrictEqual(causal[0], [1, 0, 0]);
	assert.equal(causal[1][2], 0);
	assert.ok(Math.abs(causal[2].reduce((a, b) => a + b) - 1) < 1e-12);
});
