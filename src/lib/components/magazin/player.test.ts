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

const { podcastEpisodes } = await import('../../content/magazin.js');
const {
	MATRIX_COLUMNS,
	MATRIX_ROWS,
	TICK_MS,
	buildTimeline,
	columnDetents,
	createPlayer,
	formatClock,
	matrixCell,
	matrixFrame,
	paragraphAt,
	pauseSign,
	segmentAt
} = await import('./player.js');

/** A clock the test drives by hand; it counts open intervals to prove there is no leak. */
function fakeClock() {
	let now = 0;
	const timers = new Map<number, () => void>();
	let next = 0;
	return {
		now: () => now,
		every(ms: number, callback: () => void) {
			assert.equal(ms, TICK_MS);
			const id = next++;
			timers.set(id, callback);
			return () => {
				timers.delete(id);
			};
		},
		advance(ms: number) {
			const steps = Math.round(ms / TICK_MS);
			for (let step = 0; step < steps; step += 1) {
				now += TICK_MS;
				for (const callback of [...timers.values()]) callback();
			}
		},
		get open() {
			return timers.size;
		}
	};
}

const TIMELINE = {
	duration: 100,
	segments: [
		{ index: 0, title: 'A', script: 'eins zwei', start: 0, end: 40, pauseSeconds: 0 },
		{
			index: 1,
			title: 'B',
			script: 'drei',
			start: 40,
			end: 100,
			listenerPrompt: 'Frage?',
			pauseSeconds: 2
		}
	]
};

test('the matrix is 44 × 12; one column is one slice, the current one fills from the bottom', () => {
	assert.equal(MATRIX_COLUMNS, 44);
	assert.equal(MATRIX_ROWS, 12);
	assert.deepEqual(matrixFrame(0, 1200), { played: 0, rows: 0 });
	assert.deepEqual(matrixFrame(1200, 1200), { played: 44, rows: 0 });
	const frame = matrixFrame(1200 * (10.5 / 44), 1200);
	assert.deepEqual(frame, { played: 10, rows: 6 });
	assert.equal(matrixCell(frame, 9, 0), true);
	assert.equal(matrixCell(frame, 10, 11), true);
	assert.equal(matrixCell(frame, 10, 5), false);
	assert.equal(matrixCell(frame, 11, 11), false);
	// Only the current column changes between two nearby positions.
	const a = matrixFrame(500, 1200);
	const b = matrixFrame(502, 1200);
	for (let column = 0; column < 44; column += 1) {
		if (column === a.played) continue;
		for (let row = 0; row < 12; row += 1) {
			assert.equal(matrixCell(a, column, row), matrixCell(b, column, row));
		}
	}
});

test('a thinking pause draws ‖ from dots in the text colour, the rest stays frozen', () => {
	const sign: [number, number][] = [];
	for (let column = 0; column < 44; column += 1) {
		for (let row = 0; row < 12; row += 1) if (pauseSign(column, row)) sign.push([column, row]);
	}
	assert.deepEqual([...new Set(sign.map(([column]) => column))], [19, 20, 23, 24]);
	assert.equal(sign.length, 4 * 8);
	const open = matrixFrame(0, 100);
	const full = matrixFrame(100, 100);
	assert.equal(matrixCell(open, 19, 5, true), 'sign');
	assert.equal(matrixCell(full, 19, 5, true), 'sign');
	assert.equal(matrixCell(open, 0, 5, true), false);
	assert.equal(matrixCell(full, 0, 5, true), true);
});

test('the scrub axis snaps to column boundaries from 0 to the end', () => {
	const detents = columnDetents(1200);
	assert.equal(detents.length, 45);
	assert.equal(detents[0], 0);
	assert.equal(detents[44], 1200);
	assert.ok(Math.abs(detents[1] - 1200 / 44) < 1e-9);
});

test('the active paragraph follows the word share of the segment', () => {
	const segment = {
		index: 0,
		title: 'S',
		script: 'eins zwei drei\n\nvier',
		start: 0,
		end: 40,
		pauseSeconds: 0
	};
	assert.equal(paragraphAt(segment, 0), 0);
	assert.equal(paragraphAt(segment, 29), 0);
	assert.equal(paragraphAt(segment, 31), 1);
	assert.equal(paragraphAt(segment, 400), 1);
});

test('the episodes keep their timeline and duration', () => {
	const timeline = buildTimeline(podcastEpisodes[0]);
	assert.equal(timeline.duration, 1200);
	assert.equal(timeline.segments.length, 7);
	assert.equal(formatClock(timeline.duration), '20:00');
	assert.ok(timeline.segments.every((segment, index) => segment.index === index));
});

test('playback ticks at 12 fps only while playing; pause clears the interval', () => {
	const clock = fakeClock();
	const player = createPlayer(TIMELINE, clock);
	assert.equal(clock.open, 0);
	player.play();
	assert.equal(clock.open, 1);
	clock.advance(1000);
	assert.ok(Math.abs(player.getState().position - 1) < 1e-6);
	player.pause();
	assert.equal(clock.open, 0);
	assert.equal(player.activeTimers(), 0);
	clock.advance(1000);
	assert.ok(Math.abs(player.getState().position - 1) < 1e-6);
});

test('reaching a prompt opens a thinking pause; the key or the countdown ends it', () => {
	const clock = fakeClock();
	const player = createPlayer(TIMELINE, clock);
	player.seek(39);
	player.play();
	clock.advance(1000);
	let state = player.getState();
	assert.equal(state.position, 40);
	assert.deepEqual(state.thinking?.segment, 1);
	// Frozen: the position does not move while the listener thinks.
	clock.advance(1000);
	assert.equal(player.getState().position, 40);
	clock.advance(1500);
	assert.equal(player.getState().thinking, null);
	// The key ends a pause at once.
	player.seek(39);
	clock.advance(1000);
	assert.ok(player.getState().thinking);
	player.toggle();
	state = player.getState();
	assert.equal(state.thinking, null);
	assert.equal(state.playing, true);
});

test('the playback chapter ID changes only at a chapter boundary or a committed jump', () => {
	const clock = fakeClock();
	const player = createPlayer(TIMELINE, clock);
	const chapter = () => segmentAt(TIMELINE.segments, player.getState().position).index;
	player.seek(39);
	assert.equal(chapter(), 0);
	player.play();
	clock.advance(500);
	assert.equal(chapter(), 0);
	clock.advance(500);
	assert.equal(chapter(), 1);
	clock.advance(2500);
	assert.equal(chapter(), 1);
	player.pause();
	player.seek(0);
	assert.equal(chapter(), 0);
	player.seek(40);
	assert.equal(chapter(), 1);
	player.dispose();
});

test('the end stops the clock; play starts over from the beginning', () => {
	const clock = fakeClock();
	const player = createPlayer(TIMELINE, clock);
	player.seek(99.5);
	player.play();
	clock.advance(1000);
	assert.equal(player.getState().ended, true);
	assert.equal(player.getState().playing, false);
	assert.equal(clock.open, 0);
	player.play();
	assert.equal(player.getState().position, 0);
	player.dispose();
});

test('dispose leaves no timer behind and ignores later calls (route leave)', () => {
	const clock = fakeClock();
	const player = createPlayer(TIMELINE, clock);
	let calls = 0;
	player.subscribe(() => (calls += 1));
	player.play();
	clock.advance(500);
	player.dispose();
	assert.equal(clock.open, 0);
	const before = calls;
	player.play();
	player.seek(10);
	clock.advance(1000);
	assert.equal(clock.open, 0);
	assert.equal(calls, before);
});
