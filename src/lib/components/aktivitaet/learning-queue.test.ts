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

const { LEARNING_QUEUE_EVENT, LEARNING_QUEUE_KEY, readLearningQueue, toggleLearningQueue } =
	await import('../../learning-queue.js');

const previous = {
	id: 'other',
	title: 'Attention',
	route: '/erklaerungen',
	type: 'explanation',
	addedAt: 1
} as const;
const topic = {
	id: 'activity:lernrate',
	title: 'Lernrate',
	route: '/uebungen?task=a-gd-lernrate-auswahl',
	type: 'exercise'
} as const;

function memoryStorage(initial: unknown[] = []) {
	const values = new Map([[LEARNING_QUEUE_KEY, JSON.stringify(initial)]]);
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value)
	};
}

test('toggle persists the shared shape and notifies the start page after each write', () => {
	const storage = memoryStorage([previous]);
	const events = new EventTarget();
	const seen: unknown[] = [];
	events.addEventListener(LEARNING_QUEUE_EVENT, (event) => {
		seen.push([(event as CustomEvent).detail, readLearningQueue(storage)]);
	});

	const added = toggleLearningQueue(storage, events, topic, 50);
	assert.deepEqual(added, [previous, { ...topic, addedAt: 50 }]);
	const removed = toggleLearningQueue(storage, events, topic);
	assert.deepEqual(removed, [previous]);
	assert.deepEqual(seen, [
		[added, added],
		[removed, removed]
	]);
});

test('a stored foreign or broken entry never blocks the toggle and stays as written', () => {
	const foreign = { id: topic.id, title: 'Neu', route: '/x', type: 'podcast', extra: 1 };
	const storage = memoryStorage([foreign, 'odd', null, previous]);
	const added = toggleLearningQueue(storage, undefined, topic, 7);
	assert.deepEqual(added, [previous, { ...topic, addedAt: 7 }]);
	assert.deepEqual(JSON.parse(storage.values.get(LEARNING_QUEUE_KEY)!), [
		foreign,
		'odd',
		null,
		previous,
		{ ...topic, addedAt: 7 }
	]);
	assert.deepEqual(toggleLearningQueue(storage, undefined, topic), [previous]);
	assert.deepEqual(JSON.parse(storage.values.get(LEARNING_QUEUE_KEY)!), [
		foreign,
		'odd',
		null,
		previous
	]);
	// A broken stored value never locks the learner out either.
	storage.values.set(LEARNING_QUEUE_KEY, '{kaputt');
	assert.deepEqual(toggleLearningQueue(storage, undefined, topic, 9), [{ ...topic, addedAt: 9 }]);
});

test('a failed write is never confirmed and sends no event', () => {
	const events = new EventTarget();
	let notified = 0;
	events.addEventListener(LEARNING_QUEUE_EVENT, () => (notified += 1));
	const readOnly = {
		getItem: () => JSON.stringify([previous]),
		setItem() {
			throw new Error('quota');
		}
	};
	assert.equal(toggleLearningQueue(readOnly, events, topic), undefined);
	const blocked = {
		getItem(): string | null {
			throw new Error('blocked');
		},
		setItem() {}
	};
	assert.equal(toggleLearningQueue(blocked, events, topic), undefined);
	assert.equal(readLearningQueue(blocked), undefined);
	assert.equal(notified, 0);
});

test('only valid topics with an app route are written', () => {
	for (const bad of [
		{ ...topic, id: '' },
		{ ...topic, title: '  ' },
		{ ...topic, route: 'https://example.org' },
		{ ...topic, route: 'javascript:alert(1)' },
		{ ...topic, type: 'podcast' as 'exercise' }
	]) {
		const storage = memoryStorage([previous]);
		assert.equal(toggleLearningQueue(storage, undefined, bad), undefined, JSON.stringify(bad));
		assert.deepEqual(JSON.parse(storage.values.get(LEARNING_QUEUE_KEY)!), [previous]);
	}
});
