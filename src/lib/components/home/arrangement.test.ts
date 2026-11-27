import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import type { Arrangement } from './arrangement.js';

// Bundler imports use .js specifiers. Resolve them to test the original TypeScript in Node.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('./') && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const {
	availableArrangement,
	initialArrangement,
	moveOffer,
	offerColumns,
	parseArrangement,
	swipeAway
} = await import('./arrangement.js');
const { todayProgress } = await import('./progress.js');

const POOL = ['a', 'b', 'c', 'd', 'e'];
const SLOTS = 3;

function allIds(arrangement: Arrangement): string[] {
	return [...arrangement.slots, ...arrangement.waiting, ...arrangement.away].sort();
}

test('a swipe refills only the freed slot; later queues at the end', () => {
	const next = swipeAway(initialArrangement(POOL, SLOTS), 1, 'later');
	assert.deepEqual(next.slots, ['a', 'd', 'c']);
	assert.deepEqual(next.waiting, ['e', 'b']);
	assert.deepEqual(next.away, []);
});

test('away parks the offer and it returns only when nothing else waits', () => {
	let arrangement = initialArrangement(POOL, SLOTS);
	arrangement = swipeAway(arrangement, 0, 'dismiss');
	assert.deepEqual(arrangement.slots, ['d', 'b', 'c']);
	assert.deepEqual(arrangement.away, ['a']);
	arrangement = swipeAway(arrangement, 0, 'dismiss');
	assert.deepEqual(arrangement.slots, ['e', 'b', 'c']);
	assert.deepEqual(arrangement.waiting, ['a']);
	assert.deepEqual(arrangement.away, ['d']);
	for (let step = 0; step < 10; step += 1) {
		arrangement = swipeAway(arrangement, step % SLOTS, step % 2 ? 'later' : 'dismiss');
		assert.deepEqual(allIds(arrangement), [...POOL].sort());
		assert.ok(arrangement.waiting.length > 0);
	}
});

test('moving shifts the tiles in between by one', () => {
	const moved = moveOffer(initialArrangement(POOL, SLOTS), 0, 2);
	assert.deepEqual(moved.slots, ['b', 'c', 'a']);
	assert.equal(moveOffer(moved, 0, 5), moved);
});

test('a stored arrangement must hold exactly the current pool', () => {
	const fresh = initialArrangement(POOL, SLOTS);
	const stored = swipeAway(fresh, 2, 'dismiss');
	assert.deepEqual(parseArrangement(JSON.parse(JSON.stringify(stored)), POOL, SLOTS), stored);
	assert.deepEqual(
		parseArrangement({ slots: ['a', 'b', 'x'], waiting: ['d'], away: [] }, POOL, SLOTS),
		fresh
	);
	assert.deepEqual(parseArrangement('broken', POOL, SLOTS), fresh);
	assert.deepEqual(
		parseArrangement(stored, [...POOL, 'f'], SLOTS),
		initialArrangement([...POOL, 'f'], SLOTS)
	);
});

test('completed exercises stay out of all visible queues, including refill', () => {
	const current = initialArrangement(POOL, SLOTS);
	const available = availableArrangement(current, new Set(['b', 'd']));
	assert.deepEqual(available, { slots: ['a', 'e', 'c'], waiting: [], away: [] });
	assert.deepEqual(current, initialArrangement(POOL, SLOTS));
	assert.equal(swipeAway(available, 1, 'dismiss'), available);
});

test('high importance occupies two columns wherever the offer lands', () => {
	assert.equal(offerColumns('high'), 2);
	assert.equal(offerColumns('normal'), 1);
});

test('today announces empty, partial and full progress and caps overflow', () => {
	assert.deepEqual(todayProgress(0, 0), {
		completed: 0,
		target: 0,
		label: 'Heute: 0 von 0 Lernschritten geschafft'
	});
	assert.equal(todayProgress(2, 5).label, 'Heute: 2 von 5 Lernschritten geschafft');
	assert.equal(todayProgress(6, 5).completed, 5);
});
