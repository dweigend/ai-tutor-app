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

const { drawValleySheet } = await import('./fallback-2d.js');
const { VALLEY_EXTENT, VALLEY_MARK_COUNT, gradientSteps, valley, valleyMarks } =
	await import('./surface.js');

const TOLERANCE = 1e-9;
// The free lab of /erklaerungen: start at 90% of the rim, η 0.25, κ 1 (ValleyLab.svelte).
const LAB = {
	eta: 0.25,
	kappa: 1,
	start: { x: -0.9 * VALLEY_EXTENT, y: 0.9 * VALLEY_EXTENT },
	free: true
};
const SOLUTION = { ...LAB, free: false };
const DIVERGING = { ...LAB, eta: 1.1 };

/** Inverse of the sheet mapping: pad 12, size 320, y pointing up. */
function sheetToFloor(mark: { x: number; y: number }, extent: number, size = 320) {
	const pad = 12;
	const scale = (size - 2 * pad) / (2 * extent);
	return { x: (mark.x - pad) / scale - extent, y: extent - (mark.y - pad) / scale };
}

for (const [name, params] of [
	['free lab', LAB],
	['worked solution', SOLUTION],
	['diverging lab', DIVERGING]
] as const) {
	test(`2D sheet marks are the exact gradient steps of the data table (${name})`, () => {
		const fn = valley(params);
		const steps = gradientSteps(fn, params.start, params.eta, VALLEY_MARK_COUNT);
		assert.deepEqual(valleyMarks(params), steps);

		const sheet = drawValleySheet({ ...params, prediction: null });
		assert.equal(sheet.marks.length, steps.length);
		assert.equal(sheet.points.length, steps.length);
		for (const [index, step] of steps.entries()) {
			assert.ok(Math.abs(sheet.points[index].x - step.x) < TOLERANCE, `x of point ${index}`);
			assert.ok(Math.abs(sheet.points[index].y - step.y) < TOLERANCE, `y of point ${index}`);
			assert.equal(sheet.marks[index].label, index);
			const inside = Math.abs(step.x) <= fn.extent && Math.abs(step.y) <= fn.extent;
			assert.equal(sheet.marks[index].stray, !inside, `stray flag of mark ${index}`);
			if (!inside) continue;
			// Sheet coordinates are rounded to 0.01 px; on the floor that is under 0.0002.
			const floor = sheetToFloor(sheet.marks[index], fn.extent);
			assert.ok(Math.abs(floor.x - step.x) < 2e-4, `sheet x of mark ${index}`);
			assert.ok(Math.abs(floor.y - step.y) < 2e-4, `sheet y of mark ${index}`);
		}
	});
}

test('free lab mark 1 sits where the table says, not on the physics trace', () => {
	const steps = valleyMarks(LAB);
	// x₁ = x₀ · (1 − 2ηκ) = −1.35 · 0.5 = −0.675: the value the table lists.
	assert.ok(Math.abs(steps[1].x - -0.675) < TOLERANCE);
	const sheet = drawValleySheet({ ...LAB, prediction: null });
	const floor = sheetToFloor(sheet.marks[1], VALLEY_EXTENT);
	assert.ok(Math.abs(floor.x - -0.675) < 2e-4);
});

test('steps passed in by the caller are the steps drawn', () => {
	const steps = valleyMarks(LAB);
	const sheet = drawValleySheet({ ...LAB, prediction: null, steps });
	assert.deepEqual(sheet.points, steps);
	assert.notEqual(sheet.points, steps, 'the sheet keeps its own copy');
});
