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

const { MAX_TILES, MIN_TILES, bento, gridArea } = await import('./bento.js');
const { homeTiles } = await import('../../navigation.js');

const FORMATS = ['portrait', 'landscape'] as const;
const COUNTS = Array.from({ length: MAX_TILES - MIN_TILES + 1 }, (_, index) => MIN_TILES + index);

test('the smallest template holds the areas of the app and the day tile', () => {
	assert.equal(MIN_TILES, homeTiles.length + 1);
});

test('every template gives each tile one cell and fills the screen without a gap or overlap', () => {
	for (const format of FORMATS) {
		for (const count of COUNTS) {
			const { columns, rows, cells } = bento(count, format);
			assert.equal(cells.length, count, `${format} ${count}`);
			const covered = new Set<string>();
			for (const cell of cells) {
				for (let row = cell.row; row < cell.row + cell.rows; row++) {
					for (let column = cell.column; column < cell.column + cell.columns; column++) {
						const key = `${row}/${column}`;
						assert.ok(!covered.has(key), `${format} ${count}: overlap at ${key}`);
						assert.ok(row <= rows && column <= columns, `${format} ${count}: ${key} outside`);
						covered.add(key);
					}
				}
			}
			assert.equal(covered.size, columns * rows, `${format} ${count}: gap`);
		}
	}
});

test('the day tile always holds the bottom right corner, under the corner duck', () => {
	for (const format of FORMATS) {
		for (const count of COUNTS) {
			const { columns, rows, cells } = bento(count, format);
			const day = cells.at(-1)!;
			assert.equal(day.column + day.columns - 1, columns, `${format} ${count}`);
			assert.equal(day.row + day.rows - 1, rows, `${format} ${count}`);
		}
	}
});

test('a grid mixes sizes: the first tile is the largest and no two neighbours repeat one shape', () => {
	for (const format of FORMATS) {
		for (const count of COUNTS) {
			const { cells } = bento(count, format);
			const areas = cells.map((cell) => cell.columns * cell.rows);
			assert.equal(Math.max(...areas), areas[0], `${format} ${count}`);
			const shapes = new Set(cells.map((cell) => `${cell.columns}x${cell.rows}`));
			assert.ok(shapes.size >= 4, `${format} ${count}: only ${shapes.size} shapes`);
		}
	}
});

test('a label has room: every tile is at least two columns wide, on a phone two rows high', () => {
	for (const count of COUNTS) {
		for (const cell of bento(count, 'portrait').cells) {
			assert.ok(cell.columns >= 2 && cell.rows >= 2, `portrait ${count}`);
		}
		for (const cell of bento(count, 'landscape').cells) {
			assert.ok(cell.columns >= 2, `landscape ${count}`);
		}
	}
});

test('cells at the top and left screen edge are marked for the safe area', () => {
	const { cells } = bento(6, 'portrait');
	assert.deepEqual(
		cells.map(({ top, left }) => [top, left]),
		[
			[true, true],
			[false, true],
			[false, false],
			[false, true],
			[false, true],
			[false, false]
		]
	);
});

test('counts outside the range fall back to the nearest template', () => {
	assert.equal(bento(2, 'portrait').cells.length, MIN_TILES);
	assert.equal(bento(40, 'landscape').cells.length, MAX_TILES);
});

test('a cell becomes a grid-area shorthand', () => {
	assert.equal(gridArea(bento(6, 'portrait').cells[2]), '5 / 5 / span 5 / span 2');
});
