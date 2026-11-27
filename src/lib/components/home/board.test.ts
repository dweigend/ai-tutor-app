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

const { homeTopics, initialBoard, moveTile, parseBoard, sendBack, syncBoard } =
	await import('./board.js');
const { todayProgress } = await import('./progress.js');

const CORE = ['a', 'b', 'c'];
const SLOTS = 2;

test('the mock board includes Python and AP6 tiles, the live board keeps served tasks', () => {
	const locked = {
		id: 'activity:lernrate',
		title: 'Lernrate',
		route: '/uebungen?task=a-gd-lernrate-auswahl',
		type: 'exercise',
		addedAt: 2
	} as const;
	const python = {
		...locked,
		id: 'accumulator',
		route: '/uebungen?task=a-akkumulator-vorhersagen',
		addedAt: 1
	};
	const open = {
		...locked,
		id: 'retrieval',
		route: '/uebungen?task=a-bp-addieren-erklaeren',
		addedAt: 0
	};
	assert.deepEqual(homeTopics([open, python, locked], 'mock'), [locked, python, open]);
	assert.deepEqual(homeTopics([open, python, locked], 'http'), [open]);
});

test('without topics the board shows the areas in their first order', () => {
	const sync = syncBoard(initialBoard(CORE), CORE, [], SLOTS);
	assert.deepEqual(sync.board, { shown: CORE, waiting: [] });
	assert.deepEqual(sync.arrived, []);
	assert.deepEqual(sync.displaced, []);
});

test('new topics land in front, the newest first', () => {
	const sync = syncBoard(initialBoard(CORE), CORE, ['t2', 't1'], SLOTS);
	assert.deepEqual(sync.board.shown, ['t2', 't1', 'a', 'b', 'c']);
	assert.deepEqual(sync.arrived, ['t2', 't1']);
});

test('only a few topics fit: older ones wait, an older topic on screen gives way', () => {
	const first = syncBoard(initialBoard(CORE), CORE, ['t3', 't2', 't1'], SLOTS);
	assert.deepEqual(first.board, { shown: ['t3', 't2', 'a', 'b', 'c'], waiting: ['t1'] });
	assert.deepEqual(first.arrived, ['t3', 't2']);
	assert.deepEqual(first.displaced, []);

	const second = syncBoard(first.board, CORE, ['t4', 't3', 't2', 't1'], SLOTS);
	assert.deepEqual(second.board, { shown: ['t4', 't3', 'a', 'b', 'c'], waiting: ['t2', 't1'] });
	assert.deepEqual(second.arrived, ['t4']);
	assert.deepEqual(second.displaced, ['t2']);
});

test('a topic that left the queue leaves the board and the next waiting one moves up', () => {
	const board = { shown: ['t3', 'a', 't2', 'b', 'c'], waiting: ['t1'] };
	const sync = syncBoard(board, CORE, ['t3', 't1'], SLOTS);
	assert.deepEqual(sync.board, { shown: ['t1', 't3', 'a', 'b', 'c'], waiting: [] });
	assert.deepEqual(sync.arrived, ['t1']);
});

test('the areas never leave the board and the viewer keeps their order', () => {
	const sync = syncBoard(
		{ shown: ['c', 'gone', 'a', 'a'], waiting: ['b', 'old'] },
		CORE,
		[],
		SLOTS
	);
	assert.deepEqual(sync.board, { shown: ['c', 'a', 'b'], waiting: [] });
	assert.deepEqual(sync.arrived, ['b']);
});

test('later moves an area to the last place', () => {
	const board = { shown: ['t1', 'a', 'b', 'c'], waiting: ['t2'] };
	assert.deepEqual(sendBack(board, 'a', CORE), { shown: ['t1', 'b', 'c', 'a'], waiting: ['t2'] });
});

test('later swaps a topic with the first waiting one, or moves it back when none waits', () => {
	const board = { shown: ['t1', 'a', 'b', 'c'], waiting: ['t2', 't3'] };
	assert.deepEqual(sendBack(board, 't1', CORE), {
		shown: ['t2', 'a', 'b', 'c'],
		waiting: ['t3', 't1']
	});
	const alone = { shown: ['t1', 'a', 'b', 'c'], waiting: [] };
	assert.deepEqual(sendBack(alone, 't1', CORE).shown, ['a', 'b', 'c', 't1']);
	assert.equal(sendBack(alone, 'unknown', CORE), alone);
});

test('a moved tile takes the place of its target and the tiles in between shift by one', () => {
	const board = { shown: ['a', 'b', 'c', 'd'], waiting: ['w'] };
	assert.deepEqual(moveTile(board, 'a', 'c').shown, ['b', 'c', 'a', 'd']);
	assert.deepEqual(moveTile(board, 'd', 'b').shown, ['a', 'd', 'b', 'c']);
	assert.deepEqual(moveTile(board, 'd', 'b').waiting, ['w']);
	assert.equal(moveTile(board, 'a', 'a'), board);
	assert.equal(moveTile(board, 'a', 'missing'), board);
});

test('a stored board is read back; anything else is ignored', () => {
	const board = { shown: ['b', 'a'], waiting: ['t1'] };
	assert.deepEqual(parseBoard(JSON.parse(JSON.stringify(board))), board);
	assert.equal(parseBoard(null), undefined);
	assert.equal(parseBoard({ shown: ['a'], waiting: [1] }), undefined);
	assert.equal(parseBoard({ slots: ['a'], waiting: [], away: [] }), undefined);
});

test('today progress has a spoken label and stays within the planned steps', () => {
	assert.deepEqual(todayProgress(3, 12), {
		completed: 3,
		target: 12,
		label: 'Heute: 3 von 12 Lernschritten geschafft'
	});
	assert.equal(todayProgress(20, 12).completed, 12);
	assert.deepEqual(todayProgress(Number.NaN, -4), {
		completed: 0,
		target: 0,
		label: 'Heute: 0 von 0 Lernschritten geschafft'
	});
});
