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
	LEARNING_QUEUE_EVENT,
	LEARNING_QUEUE_KEY,
	newestFirst,
	parseLearningQueue,
	parseLearningQueueText,
	readLearningQueueText,
	readLearningQueue,
	removeFromLearningQueue,
	restoreToLearningQueue,
	shortTitle
} = await import('../../learning-queue.js');

const ATTENTION = {
	id: 'attention',
	title: 'Attention',
	route: '/erklaerungen',
	type: 'explanation' as const,
	addedAt: 20
};
const BACKPROP = {
	id: 'backprop',
	title: 'Backprop',
	route: '/uebungen?task=b',
	type: 'exercise' as const,
	addedAt: 30
};

function memoryStorage(initial?: string) {
	const values = new Map<string, string>();
	if (initial !== undefined) values.set(LEARNING_QUEUE_KEY, initial);
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	};
}

const blocked = {
	getItem(): string | null {
		throw new Error('blocked');
	},
	setItem() {
		throw new Error('blocked');
	}
};

test('the shared contract: one storage key and one event name', () => {
	assert.equal(LEARNING_QUEUE_KEY, 'tutor.learning-queue.v1');
	assert.equal(LEARNING_QUEUE_EVENT, 'tutor:learning-queue');
});

test('valid topics are read; the title is tidied', () => {
	assert.deepEqual(parseLearningQueue([ATTENTION, { ...BACKPROP, title: '  Back   prop ' }]), [
		ATTENTION,
		{ ...BACKPROP, title: 'Back prop' }
	]);
});

test('broken entries, unknown types and doubles are dropped', () => {
	const stored = [
		ATTENTION,
		{ ...ATTENTION, title: 'Double' },
		{ ...BACKPROP, type: 'today' },
		{ ...BACKPROP, id: '' },
		{ ...BACKPROP, title: '   ' },
		null,
		'text'
	];
	assert.deepEqual(parseLearningQueue(stored), [ATTENTION]);
	assert.deepEqual(parseLearningQueue({ id: 'no list' }), []);
	assert.deepEqual(parseLearningQueueText('not json'), []);
	assert.deepEqual(parseLearningQueueText(null), []);
});

test('a route must be a path of this app', () => {
	for (const route of [
		'https://example.org',
		'//example.org',
		'javascript:alert(1)',
		'/a b',
		'/\\x',
		''
	]) {
		assert.deepEqual(parseLearningQueue([{ ...ATTENTION, route }]), [], route);
	}
	assert.equal(parseLearningQueue([{ ...ATTENTION, route: '/magazin/slug#teil' }]).length, 1);
});

test('a missing time counts as the oldest; the newest topic comes first', () => {
	const [untimed] = parseLearningQueue([{ ...ATTENTION, addedAt: 'gestern' }]);
	assert.equal(untimed.addedAt, 0);
	assert.deepEqual(
		newestFirst([untimed, BACKPROP, ATTENTION]).map(({ addedAt }) => addedAt),
		[30, 20, 0]
	);
});

test('a tile shows at most three words', () => {
	assert.equal(shortTitle('Attention'), 'Attention');
	assert.equal(shortTitle('  Warum Attention einen Teiler braucht '), 'Warum Attention einen');
});

test('a finished topic leaves the stored queue; other entries stay as they were written', () => {
	const foreign = { ...BACKPROP, note: 'kept' };
	const storage = memoryStorage(JSON.stringify([ATTENTION, foreign, 'odd']));
	const change = removeFromLearningQueue(storage, 'attention');
	assert.deepEqual(change, {
		items: [
			{
				id: 'backprop',
				title: 'Backprop',
				route: '/uebungen?task=b',
				type: 'exercise',
				addedAt: 30
			}
		],
		removed: { entry: ATTENTION, index: 0 }
	});
	assert.deepEqual(JSON.parse(readLearningQueueText(storage)!), [foreign, 'odd']);
});

test('a removal announces the valid queue after the write', () => {
	const storage = memoryStorage(JSON.stringify([ATTENTION, BACKPROP]));
	const events = new EventTarget();
	const seen: unknown[] = [];
	events.addEventListener(LEARNING_QUEUE_EVENT, (event) => {
		seen.push([(event as CustomEvent).detail, readLearningQueue(storage)]);
	});
	removeFromLearningQueue(storage, 'backprop', events);
	assert.deepEqual(seen, [[[ATTENTION], [ATTENTION]]]);
});

test('undo puts back only the finished entry and keeps changes from other tabs', () => {
	const foreign = { ...BACKPROP, note: 'kept' };
	const storage = memoryStorage(JSON.stringify([ATTENTION, foreign]));
	const change = removeFromLearningQueue(storage, 'attention');
	assert.ok(change?.removed);
	// Meanwhile another tab adds a topic and finishes Backprop.
	const other = { ...ATTENTION, id: 'other', title: 'Other', addedAt: 40 };
	storage.setItem(LEARNING_QUEUE_KEY, JSON.stringify([other]));
	assert.deepEqual(restoreToLearningQueue(storage, change.removed), [ATTENTION, other]);
	assert.deepEqual(JSON.parse(readLearningQueueText(storage)!), [ATTENTION, other]);
	// A topic that is back already is not doubled.
	assert.deepEqual(restoreToLearningQueue(storage, change.removed), [ATTENTION, other]);
});

test('blocked or broken storage never throws and never confirms', () => {
	assert.equal(readLearningQueueText(blocked), undefined);
	assert.equal(readLearningQueue(blocked), undefined);
	assert.equal(removeFromLearningQueue(blocked, 'attention'), undefined);
	assert.equal(restoreToLearningQueue(blocked, { entry: ATTENTION, index: 0 }), undefined);
	const readOnly = { ...memoryStorage(JSON.stringify([ATTENTION])), setItem: blocked.setItem };
	assert.equal(removeFromLearningQueue(readOnly, 'attention'), undefined);
	assert.deepEqual(removeFromLearningQueue(memoryStorage('{"no":"list"}'), 'attention'), {
		items: []
	});
	assert.deepEqual(removeFromLearningQueue(memoryStorage(), 'attention'), { items: [] });
});
