import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

// Match the API tests: production imports use .js specifiers for the TypeScript modules.
const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.startsWith(new URL('../', import.meta.url).href) &&
			(specifier.startsWith('./') || specifier.startsWith('../')) &&
			specifier.endsWith('.js')
		) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});
const {
	ScreenContextStore,
	createScreenContext,
	LearningMemoryStore,
	LEARNING_MEMORY_STORAGE_KEY,
	buildAgentContextSnapshot,
	buildContextualHelp,
	INDEPENDENT_PROBE_HELP,
	findRelevantNotes
} = await import('./index.js');
hooks.deregister();

function memoryFixture() {
	const data = new Map<string, string>();
	const storage = {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => {
			data.set(key, value);
		},
		removeItem: (key: string) => {
			data.delete(key);
		}
	};
	let time = 1_000;
	const now = () => time;
	const memory = new LearningMemoryStore({ storage, now });
	return {
		memory,
		storage,
		now,
		advance: (seconds: number) => {
			time += seconds * 1000;
		}
	};
}

test('Screen Context replaces stale section, term and exercise fields and publishes copies', () => {
	const screen = new ScreenContextStore(
		{ route: '/erklaerungen', termId: 'q', momentId: 'attention' },
		() => 12
	);
	const seen: string[] = [];
	const dispose = screen.subscribe((value) => {
		seen.push(value.route);
		value.route = '/changed';
	});
	screen.setScreen({ route: '/erklaerungen', momentId: 'scaling' });
	assert.equal(screen.getSnapshot().termId, undefined);
	screen.setScreen({ route: '/magazin/lernen' });
	dispose();
	screen.setScreen({ route: '/' });
	assert.deepEqual(seen, ['/erklaerungen', '/erklaerungen', '/magazin/lernen']);
	assert.deepEqual(screen.getSnapshot(), { route: '/', isIndependentProbe: false, updatedAt: 12 });
});

test('Dwell measures only visible intervals, persists progress and counts repeat visits', () => {
	const { memory, storage, advance, now } = memoryFixture();
	const essay = { route: '/magazin/attention', kind: 'essay', topic: 'attention' } as const;
	class Tab extends EventTarget {
		hidden = true;
		setHidden(hidden: boolean) {
			this.hidden = hidden;
			this.dispatchEvent(new Event('visibilitychange'));
		}
	}
	const tab = new Tab();
	const unbind = memory.bindVisibility(tab);
	memory.recordVisit(essay);
	advance(100);
	tab.setHidden(false);
	advance(3.5);
	memory.recordDepth(0.6);
	memory.recordDepth(0.3);
	tab.setHidden(true);
	advance(600);
	tab.setHidden(false);
	advance(2.5);
	unbind();
	advance(200);
	tab.setHidden(false);
	assert.equal(memory.exportSnapshot().dwellStats[0].activeSeconds, 6);
	memory.recordVisit({ ...essay, depth: 2 });
	memory.setVisible(true);
	advance(4);
	memory.leaveContent();

	const reloaded = new LearningMemoryStore({ storage, now }).exportSnapshot();
	const [visit] = reloaded.recentHistory;
	assert.equal(visit.visits, 2);
	assert.equal(visit.depth, 1);
	assert.equal(visit.lastVisitedAt, now() - 4000);
	assert.deepEqual(reloaded.dwellStats, [{ id: visit.id, route: essay.route, activeSeconds: 10 }]);
});

test('Invalid persisted records are discarded and denied storage leaves an in-memory session', () => {
	const { storage, now } = memoryFixture();
	storage.setItem(LEARNING_MEMORY_STORAGE_KEY, '{');
	assert.deepEqual(new LearningMemoryStore({ storage }).exportSnapshot().recentHistory, []);
	storage.setItem(
		LEARNING_MEMORY_STORAGE_KEY,
		JSON.stringify({
			version: 1,
			visits: [
				{ route: '/magazin' },
				{
					id: 'wrong',
					route: '/magazin',
					kind: 'essay',
					depth: 2,
					visits: 1,
					lastVisitedAt: 1,
					activeSeconds: 1
				}
			],
			notes: [
				{
					id: 'valid',
					route: '/magazin',
					kind: 'note',
					text: 'Text',
					createdAt: 1,
					extra: 'remove'
				},
				{ id: 'bad', route: '/magazin', kind: 'unknown', text: 'Text', createdAt: 1 }
			],
			homeSignals: [{ topicId: 'spam', signal: 'unknown', recordedAt: 1 }]
		})
	);
	const recovered = new LearningMemoryStore({ storage, now }).exportSnapshot();
	assert.deepEqual(recovered.recentHistory, []);
	assert.equal(recovered.savedNotesAndQuestions.length, 1);
	assert.equal(Object.hasOwn(recovered.savedNotesAndQuestions[0], 'extra'), false);
	assert.deepEqual(recovered.inferredInterests, []);

	const denied = () => {
		throw new Error('Storage unavailable');
	};
	const offline = new LearningMemoryStore({
		storage: { getItem: denied, setItem: denied, removeItem: denied }
	});
	assert.ok(offline.addNote({ kind: 'note', route: '/magazin', text: 'Local' }));
	offline.clearAll();
	assert.deepEqual(offline.exportSnapshot().savedNotesAndQuestions, []);
	assert.deepEqual(new LearningMemoryStore().exportSnapshot().savedNotesAndQuestions, []);
});

test('Users can delete notes, visits, dwell and interests individually or clear all', () => {
	const { memory, storage, advance, now } = memoryFixture();
	memory.recordVisit({
		kind: 'video',
		route: '/magazin',
		contentId: 'short-film',
		topic: 'attention'
	});
	advance(120);
	memory.recordHomeSignal('other', 'keep');
	memory.recordHomeSignal('dismissed', 'dismiss');
	const note = memory.addNote({ route: '/magazin', kind: 'question', text: 'Was heißt Query?' });
	assert.ok(note);
	const snapshot = memory.exportSnapshot();
	assert.deepEqual(snapshot.inferredInterests, [
		{ topicId: 'attention', score: 3 },
		{ topicId: 'other', score: 2 }
	]);
	memory.deleteEntry('interest', 'attention');
	memory.deleteEntry('homeSignal', 'other');
	assert.deepEqual(
		new LearningMemoryStore({ storage, now }).exportSnapshot().inferredInterests,
		[]
	);
	memory.deleteNote(note.id);
	const id = snapshot.recentHistory[0].id;
	memory.deleteEntry('dwell', id);
	assert.deepEqual(memory.exportSnapshot().dwellStats, []);
	memory.deleteEntry('history', id);
	advance(30);
	assert.deepEqual(memory.exportSnapshot().recentHistory, []);
	assert.deepEqual(memory.exportSnapshot().dwellStats, []);
	assert.deepEqual(memory.exportSnapshot().savedNotesAndQuestions, []);

	memory.recordHomeSignal('attention', 'open');
	assert.equal(memory.exportSnapshot().inferredInterests[0].topicId, 'attention');
	memory.clearAll();
	assert.equal(JSON.parse(storage.getItem(LEARNING_MEMORY_STORAGE_KEY)!).clearedAt, now());
	assert.deepEqual(
		memory.exportSnapshot(),
		new LearningMemoryStore({ storage: null }).exportSnapshot()
	);
});

test('A bounded snapshot recalls matching notes across routes, the exact term and active time', () => {
	const { memory, advance, now } = memoryFixture();
	const screen = createScreenContext(
		{
			route: '/erklaerungen',
			topic: 'attention',
			sectionTitle: 'Warum teilen wir?',
			formulaId: 'scaled-attention',
			termId: 'attention-scale',
			termLabel: '√dₖ'
		},
		now()
	);
	memory.recordVisit({ kind: 'explanation', route: screen.route, topic: screen.topic });
	memory.addNote({
		kind: 'question',
		text: 'Was wird mit der Dimension der Keys größer?',
		route: '/magazin/attention',
		topic: 'attention',
		termId: screen.termId
	});
	memory.addNote({ kind: 'note', text: 'Nur für Python', route: '/uebungen', topic: 'python' });
	advance(42);
	memory.leaveContent();
	for (let i = 0; i < 15; i++) {
		memory.recordVisit({
			kind: 'essay',
			route: `/magazin/${i}`,
			topic: `topic-${i}`,
			title: 'x'.repeat(5000)
		});
		advance(1);
	}
	memory.leaveContent();
	const snapshot = buildAgentContextSnapshot(screen, memory, now());
	assert.equal(snapshot.recentHistory[0].route, screen.route);
	assert.equal(snapshot.recentHistory.length, 8);
	assert.equal(snapshot.inferredInterests.length, 6);
	assert.equal(snapshot.savedNotesAndQuestions.length, 2);
	assert.deepEqual(
		findRelevantNotes(screen, memory.exportSnapshot().savedNotesAndQuestions),
		snapshot.savedNotesAndQuestions
	);
	const serialized = JSON.stringify(snapshot);
	assert.ok(serialized.length < 10_000);
	assert.equal(serialized, JSON.stringify(buildAgentContextSnapshot(screen, memory, now())));
	assert.match(
		buildContextualHelp(JSON.parse(serialized)),
		/Warum teilen wir\?.*42 Sekunden.*Was wird mit der Dimension.*Wurzel aus der Dimension/
	);
});

test('An independent probe sees only the rule and records no practice memory', () => {
	const { memory, advance, now } = memoryFixture();
	memory.addNote({ kind: 'note', route: '/uebungen', text: 'Die Antwort.' });
	memory.recordVisit({ kind: 'exercise', route: '/uebungen', isIndependentProbe: true });
	advance(59);
	const screen = createScreenContext(
		{
			route: '/uebungen',
			isIndependentProbe: true,
			exerciseState: { answerSelected: '1,92', revealed: true },
			formulaId: 'attention',
			termId: 'q',
			sketchSummary: 'Die Antwort'
		},
		now()
	);
	const snapshot = buildAgentContextSnapshot(screen, memory, now());
	assert.deepEqual(snapshot.visibleScreen, {
		route: '/uebungen',
		isIndependentProbe: true,
		updatedAt: now()
	});
	assert.deepEqual(snapshot.savedNotesAndQuestions, []);
	assert.deepEqual(memory.exportSnapshot().recentHistory, []);
	assert.deepEqual(memory.exportSnapshot().dwellStats, []);
	assert.equal(buildContextualHelp({ ...snapshot, visibleScreen: screen }), INDEPENDENT_PROBE_HELP);
});

test('Two tabs preserve independent updates and clear invalidates an old visit on the same route', () => {
	const { memory: first, storage, now, advance } = memoryFixture();
	const second = new LearningMemoryStore({ storage, now });
	const visit = { kind: 'essay' as const, route: '/magazin/a' };
	second.recordVisit(visit);
	const n1 = first.addNote({ route: '/', kind: 'note', text: 'Eins' })!;
	second.addNote({ route: '/erklaerungen', kind: 'note', text: 'Zwei' });
	assert.equal(first.exportSnapshot().savedNotesAndQuestions.length, 2);
	first.deleteNote(n1.id);
	second.recordHomeSignal('demo', 'keep');
	assert.deepEqual(
		second.exportSnapshot().savedNotesAndQuestions.map((n) => n.text),
		['Zwei']
	);
	first.clearAll();
	first.recordVisit(visit);
	first.leaveContent();
	advance(20);
	second.recordDepth(1);
	second.leaveContent();
	const after = second.exportSnapshot();
	assert.deepEqual(after.savedNotesAndQuestions, []);
	assert.deepEqual(after.dwellStats, []);
	assert.equal(after.recentHistory[0].depth, 0);
});

test('Home and activity recall the latest note from another route even with many local questions', () => {
	const { memory, advance } = memoryFixture();
	memory.addNote({ kind: 'note', route: '/erklaerungen', text: 'Keys vergleichen' });
	for (const route of ['/', '/aktivitaet']) {
		for (let i = 0; i < 4; i++) {
			advance(1);
			memory.addNote({ kind: 'question', route, text: 'Frage ' + i });
		}
		const snapshot = buildAgentContextSnapshot(createScreenContext({ route }), memory);
		assert.match(buildContextualHelp(snapshot), /Keys vergleichen/);
	}
});

test('Queued tab writes rebase under the lock and a queued clear defeats stale changes', async () => {
	const { storage, now } = memoryFixture();
	const locks = navigator.locks;
	const a = new LearningMemoryStore({ storage, now, locks });
	const b = new LearningMemoryStore({ storage, now, locks });
	const flush = () => locks.request(LEARNING_MEMORY_STORAGE_KEY, () => {});
	a.addNote({ kind: 'note', route: '/', text: 'A' });
	b.addNote({ kind: 'note', route: '/', text: 'B' });
	await flush();
	assert.deepEqual(
		a.exportSnapshot().savedNotesAndQuestions.map((note) => note.text),
		['B', 'A']
	);
	await locks.request(LEARNING_MEMORY_STORAGE_KEY, () => {
		a.clearAll();
		b.addNote({ kind: 'note', route: '/', text: 'Before the clear committed' });
	});
	await flush();
	assert.deepEqual(b.exportSnapshot().savedNotesAndQuestions, []);
});

test('Home undo restores its own change and preserves a later same-millisecond signal from another tab', () => {
	const { memory, storage, now } = memoryFixture();
	const other = new LearningMemoryStore({ storage, now });
	memory.recordHomeSignal('ai', 'open');
	memory.recordHomeSignal('ai', 'keep')?.();
	assert.equal(memory.exportSnapshot().homeSignals[0].signal, 'open');
	const undo = memory.recordHomeSignal('ai', 'keep');
	other.recordHomeSignal('ai', 'keep');
	undo?.();
	assert.equal(other.exportSnapshot().homeSignals[0].signal, 'keep');
});
