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

const {
	domainWithZero,
	formatNumber,
	innerSide,
	isometricSquare,
	layoutBars,
	linear,
	parseViewBox,
	percent,
	polylinePath,
	trimmedLine
} = await import('./geometry.js');

const BOX = { left: 0, top: 0, right: 100, bottom: 100 };

test('linear maps the domain onto the range, a flat domain onto its start', () => {
	const y = linear([0, 10], [100, 0]);
	assert.equal(y(0), 100);
	assert.equal(y(10), 0);
	assert.equal(y(5), 50);
	assert.equal(linear([3, 3], [7, 9])(3), 7);
});

test('bars always stand on zero: the domain holds every value and the baseline', () => {
	assert.deepEqual(domainWithZero([48, 127, -17, 0]), [-17, 127]);
	assert.deepEqual(domainWithZero([3, 5]), [0, 5]);
});

test('Quadrat im Quadrat: the inner area is the share, clamped to 0…1', () => {
	assert.equal(innerSide(1, 10), 10);
	assert.equal(innerSide(0.25, 10), 5);
	assert.equal(innerSide(-1, 10), 0);
	assert.equal(innerSide(4, 10), 10);
	assert.equal(innerSide(Number.NaN, 10), 0);
	const side = innerSide(0.665, 20);
	assert.ok(Math.abs((side * side) / 400 - 0.665) < 1e-12);
});

test('negative bars hang below the baseline; heights start at the baseline', () => {
	const layout = layoutBars([{ value: 100 }, { value: -100 }], BOX);
	assert.equal(layout.baseline, 50);
	const [up, down] = layout.bars;
	assert.equal(up.y, 0);
	assert.equal(up.height, 50);
	assert.equal(up.negative, false);
	assert.equal(down.y, 50);
	assert.equal(down.height, 50);
	assert.equal(down.negative, true);
	assert.equal(down.tip.y, 100);
});

test('groups share a label centred under their bars and stand half a slot apart', () => {
	const layout = layoutBars(
		[
			{ value: 1, group: 'A' },
			{ value: 2, group: 'A' },
			{ value: 3, group: 'B' }
		],
		BOX
	);
	assert.deepEqual(
		layout.groups.map((group) => [group.key, group.from, group.to]),
		[
			['A', 0, 1],
			['B', 2, 2]
		]
	);
	const slot = 100 / 3.5;
	assert.ok(Math.abs(layout.bars[1].x - layout.bars[0].x - slot) < 1e-9);
	assert.ok(Math.abs(layout.bars[2].x - layout.bars[1].x - slot * 1.5) < 1e-9);
	assert.ok(Math.abs(layout.groups[0].x - (layout.bars[0].x + layout.bars[1].x) / 2) < 1e-9);
	// Every bar stays inside the box.
	for (const bar of layout.bars) {
		assert.ok(bar.x - bar.width / 2 >= 0 && bar.x + bar.width / 2 <= 100);
	}
});

test('a zero bar has no height, so nothing is drawn for it', () => {
	const layout = layoutBars([{ value: 0 }, { value: 5 }], BOX);
	assert.equal(layout.bars[0].height, 0);
});

test('callouts sit by percent of the viewBox', () => {
	assert.equal(percent(80, 320), 25);
	assert.equal(percent(5, 0), 0);
});

test('polyline, trimmed edge and isometric face give stable SVG geometry', () => {
	const path = polylinePath(
		[
			{ x: 0, y: 0 },
			{ x: 1, y: 1 }
		],
		linear([0, 1], [0, 10]),
		linear([0, 1], [10, 0])
	);
	assert.equal(path, 'M0 10 L10 0');
	const [from, to] = trimmedLine({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
	assert.deepEqual([from.x, to.x], [2, 8]);
	const face = isometricSquare({ x: 0, y: 0 }, 2, 0);
	assert.equal(face.length, 4);
	// The top corner and the bottom corner of the rhombus lie on the vertical through the origin.
	assert.ok(Math.abs(face[0].x) < 1e-9 && Math.abs(face[2].x) < 1e-9);
});

test('numbers read German with a real minus; a broken viewBox falls back to 320 × 200', () => {
	assert.equal(formatNumber(-17), '−17');
	assert.equal(formatNumber(99.995), '99,995');
	assert.equal(formatNumber(0.0045), '0,0045');
	assert.deepEqual(parseViewBox('0 0 400 120'), { width: 400, height: 120 });
	assert.deepEqual(parseViewBox('nonsense'), { width: 320, height: 200 });
});
