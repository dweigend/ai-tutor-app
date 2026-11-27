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
	checkLines,
	choiceAnswerText,
	choiceVoice,
	commitRoute,
	confidenceFigure,
	confidenceModeForHeight,
	digitsComplete,
	attemptResult,
	countsAsTaskCompletion,
	emptyAnswer,
	exerciseIcon,
	exerciseScreen,
	liveAnswer,
	findingOf,
	isReceivedOnly,
	linesText,
	RECEIVED_WORD,
	revealStatus,
	stageOf,
	stageProblems,
	openableTaskId,
	routeOpensInMode,
	visibleInMode
} = await import('./stage-model.js');
const { exerciseForTask, exercises } = await import('../../content/uebungen.js');
const { ScreenContextStore } = await import('../../memory/screen-context.js');

type Route = Parameters<typeof commitRoute>[0];
const base: Omit<Route, 'step'> = {
	isAnswerStep: true,
	phase: 'answer',
	asksConfidence: false,
	confidenceMode: 'inline'
};

test('checkLines: same set matches, an overlap deviates partly, none deviates', () => {
	assert.equal(checkLines(['z6', 'z5'], ['z5', 'z6']), 'match');
	assert.equal(checkLines(['z5'], ['z5', 'z6']), 'partial');
	assert.equal(checkLines(['z5', 'z7'], ['z5']), 'partial');
	assert.equal(checkLines(['z2'], ['z5']), 'deviates');
});

test('choiceAnswerText: one label, or the legend digits of several', () => {
	const options = [
		{ id: 'a', label: 'A: 9, B: 4' },
		{ id: 'b', label: 'A: 9, B: 9' },
		{ id: 'c', label: 'A: 4, B: 9' }
	];
	assert.equal(choiceAnswerText(options, ['b']), 'A: 9, B: 9');
	assert.equal(choiceAnswerText(options, ['c', 'a']), '1 + 3');
});

test('linesText: sorted numbers, singular and plural', () => {
	assert.equal(linesText(['z5']), 'Zeile 5');
	assert.equal(linesText(['z12', 'z6']), 'Zeilen 6 · 12');
});

test('digitsComplete: a digit and no trailing comma', () => {
	assert.equal(digitsComplete(''), false);
	assert.equal(digitsComplete('-'), false);
	assert.equal(digitsComplete('0,'), false);
	assert.equal(digitsComplete('0,25'), true);
	assert.equal(digitsComplete('-3'), true);
});

test('commitRoute: only the answer step reaches the API', () => {
	const paper = { id: 'p', ask: 'Rechne.', instrument: { kind: 'paper' } } as const;
	const lines = {
		id: 'l',
		ask: 'Welche Zeile?',
		instrument: { kind: 'lines', code: 'a\nb', max: 1 },
		localCheck: { kind: 'lines', expected: ['z1'] }
	} as const;
	const digits = {
		id: 'd',
		ask: 'Wie viel?',
		instrument: { kind: 'digits', decimals: 2 }
	} as const;
	assert.equal(commitRoute({ ...base, step: paper, isAnswerStep: false }), 'next');
	assert.equal(commitRoute({ ...base, step: lines, isAnswerStep: false }), 'local-lines');
	// An answer instrument on an intermediate step never sends.
	assert.equal(commitRoute({ ...base, step: digits, isAnswerStep: false }), 'hold');
	assert.equal(commitRoute({ ...base, step: digits }), 'submit');
	assert.equal(
		commitRoute({ ...base, step: digits, asksConfidence: true, confidenceMode: 'step' }),
		'confidence'
	);
	assert.equal(commitRoute({ ...base, step: digits, phase: 'revealed' }), 'hold');
});

test('confidence is inline at 844px and a separate step at 664px or on overflow', () => {
	const step = stageOf(exercises[0]).steps[0];
	const input = { ...base, step, asksConfidence: true };
	const inline = confidenceModeForHeight(844);
	const compact = confidenceModeForHeight(664);
	assert.equal(inline, 'inline');
	assert.equal(compact, 'step');
	assert.equal(confidenceModeForHeight(679), 'step');
	assert.equal(confidenceModeForHeight(680), 'inline');
	assert.equal(confidenceModeForHeight(844, true), 'step');
	assert.equal(commitRoute({ ...base, step, confidenceMode: compact }), 'submit');
	assert.equal(commitRoute({ ...input, confidenceMode: inline }), 'submit');
	assert.equal(commitRoute({ ...input, confidenceMode: compact }), 'confidence');
	assert.equal(commitRoute({ ...input, confidenceMode: compact, phase: 'confidence' }), 'submit');
});

test('the next step receives a fresh answer, including unanswered confidence', () => {
	const draft = emptyAnswer();
	draft.choice.push('option');
	draft.lines.push('z1');
	draft.digits = '2';
	draft.spectrum = 75;
	draft.spectrumTouched = true;
	draft.confidence = null;

	assert.deepEqual(emptyAnswer(), {
		choice: [],
		lines: [],
		digits: '',
		spectrum: 0,
		spectrumTouched: false,
		confidence: undefined
	});
});

test('a failed independent probe evaluation keeps the probe protected through retry', () => {
	const probe = exercises.find((exercise) => exercise.format === 'independent-probe');
	assert.ok(probe);
	const [step] = stageOf(probe).steps;
	const screen = new ScreenContextStore();

	for (const confidence of [25, 50, 75, 100] as const) {
		for (const outcome of ['problem', undefined] as const) {
			screen.setScreen(exerciseScreen(probe, step, '1,92', confidence, outcome, false));
			const snapshot = screen.getSnapshot();
			assert.equal(snapshot.isIndependentProbe, true);
			assert.deepEqual(snapshot.taskRef, probe.task);
			assert.deepEqual(snapshot.exerciseState, {
				answerSelected: '1,92',
				confidence,
				revealed: false
			});
		}
	}

	screen.setScreen(exerciseScreen(probe, step, '1,92', null, 'response', false));
	const confirmed = screen.getSnapshot();
	assert.equal(confirmed.isIndependentProbe, false);
	assert.equal(confirmed.exerciseState?.revealed, true);
	assert.equal(confirmed.exerciseState?.confidence, undefined);
});

test('choiceVoice: the content decides, rows default to sentences', () => {
	assert.equal(choiceVoice({ kind: 'choice', layout: 'rows' }), 'sentence');
	assert.equal(choiceVoice({ kind: 'choice', layout: 'rows', voice: 'value' }), 'value');
	assert.equal(choiceVoice({ kind: 'choice', layout: 'grid' }), 'value');
});

test('all nine exercises have a valid step order', () => {
	assert.equal(exercises.length, 9);
	for (const exercise of exercises) {
		assert.deepEqual(stageProblems(exercise), [], exercise.task.taskId);
	}
});

test('1.2 speaks its program output in Mono, 1.6 its sentences in Archivo', () => {
	const voiceOf = (taskId: string) => {
		const exercise = exercises.find((item) => item.task.taskId === taskId);
		assert.ok(exercise, taskId);
		return choiceVoice(stageOf(exercise).steps.at(-1)!.instrument);
	};
	assert.equal(voiceOf('a-akkumulator-vorhersagen'), 'value');
	assert.equal(voiceOf('a-gd-kontrast-gradientenrichtung'), 'sentence');
});

test('exercise links accept known and legacy IDs and reject unknown and inherited names', () => {
	assert.equal(exerciseForTask(exercises[0].task.taskId), exercises[0]);
	assert.equal(
		exerciseForTask('a-bp-rechengraph-skizzieren')?.task.taskId,
		'a-bp-skizze-rechengraph'
	);
	for (const id of [null, 'unknown', '__proto__', 'constructor', 'toString']) {
		assert.equal(exerciseForTask(id), undefined);
	}
});

test('the fourth evidence state is received, never partial and never a match', () => {
	assert.equal(findingOf('korrekt'), 'match');
	assert.equal(findingOf('teilweise'), 'partial');
	assert.equal(findingOf('falsch'), 'deviates');
	assert.equal(findingOf('nicht_pruefbar_oder_alternativweg'), null);
	assert.equal(revealStatus('nicht_pruefbar_oder_alternativweg'), 'received');
	assert.notEqual(revealStatus('nicht_pruefbar_oder_alternativweg'), 'partial');
	assert.notEqual(revealStatus('nicht_pruefbar_oder_alternativweg'), 'match');
	assert.equal(isReceivedOnly('nicht_pruefbar_oder_alternativweg'), true);
	for (const result of ['korrekt', 'teilweise', 'falsch'] as const) {
		assert.equal(isReceivedOnly(result), false);
	}
	assert.equal(RECEIVED_WORD, 'Eingereicht');
});

test('the confidence beside the answer is a figure only, no helper words', () => {
	assert.equal(confidenceFigure(75), '75 %');
	assert.equal(confidenceFigure(null), undefined);
	assert.equal(confidenceFigure(undefined), undefined);
});

test('a sent evidence level decides the reveal, a received attempt stays neutral', () => {
	assert.equal(attemptResult({ result: 'teilweise' }), 'teilweise');
	const received = attemptResult({
		result: 'teilweise',
		evidenceLevel: 'nicht_pruefbar_oder_alternativweg'
	});
	assert.equal(received, 'nicht_pruefbar_oder_alternativweg');
	assert.equal(revealStatus(received), 'received');
	assert.equal(attemptResult({ result: 'korrekt', evidenceLevel: 'teilwissen' }), 'teilweise');
});

test('live mode hides the locked Modul-2 test split, the demo shows all nine', () => {
	const ids = exercises.map((exercise) => exercise.task.taskId);
	assert.equal(ids.filter((id) => visibleInMode(id, 'mock')).length, 9);
	const live = ids.filter((id) => visibleInMode(id, 'http'));
	assert.ok(live.every((id) => !id.startsWith('a-gd-')));
	assert.equal(live.length, 4);
	for (const id of ['a-akkumulator-vorhersagen', 'a-ki-durchschnitt-pruefen']) {
		assert.equal(visibleInMode(id, 'mock'), true);
		assert.equal(visibleInMode(id, 'http'), false);
	}
});

test('live code-lines task sends text, the demo keeps the choice', () => {
	const choice = { kind: 'choice' as const, optionIds: ['ungleich'] };
	const parts = { lines: ['z6', 'z5'], choice: 'a · b' };
	assert.deepEqual(liveAnswer('a-bp-ki-backward-pruefen', 'mock', choice, parts), choice);
	assert.deepEqual(liveAnswer('a-akkumulator-vorhersagen', 'http', choice, parts), choice);
	assert.deepEqual(liveAnswer('a-bp-ki-backward-pruefen', 'http', choice, parts), {
		kind: 'text',
		text: 'Zeilen 5 · 6 · Tests: a · b'
	});
});

test('every list card has a format sign', () => {
	const icons = new Set(exercises.map((exercise) => exerciseIcon(exercise)));
	assert.ok(icons.has('pen'));
	assert.ok(icons.has('grid'));
	assert.ok(icons.size >= 3);
});

test('AP6 guards both exercise link parameters and queue routes in live mode', () => {
	for (const key of ['task', 'aufgabe']) {
		for (const exercise of exercises) {
			const id = exercise.task.taskId;
			const params = new URLSearchParams({ [key]: id });
			const route = '/uebungen?' + params;
			const allowed = exercise.task.courseId === 'ki-selbst-bauen' && !id.startsWith('a-gd-');
			assert.equal(openableTaskId(params, 'http'), allowed ? id : null);
			assert.equal(routeOpensInMode(route, 'http'), allowed);
			assert.equal(openableTaskId(params, 'mock'), id);
			assert.equal(routeOpensInMode(route, 'mock'), true);
		}
	}
});

test('live accumulator prediction submits printed lines, while the demo submits the choice', () => {
	for (const [id, text] of [
		['a9-b4', '9\n4'],
		['a9-b9', '9\n9']
	]) {
		const choice = { kind: 'choice' as const, optionIds: [id] };
		const parts = { lines: [], choice: '' };
		assert.deepEqual(liveAnswer('a-akkumulator-vorhersagen', 'http', choice, parts), {
			kind: 'text',
			text
		});
		assert.deepEqual(liveAnswer('a-akkumulator-vorhersagen', 'mock', choice, parts), choice);
	}
});

test('the exercise retains its tutor session after expiry until the next attempt', async () => {
	const { ExerciseSessions } = await import('../tutor/sessionStore.js');
	const sessions = new ExerciseSessions();
	const task = exercises[0].task;
	const attempt = sessions.beginAttempt(task);
	sessions.start(task, 'sess-1');
	sessions.close(task, 'sess-1');
	const { HttpTutorClient } = await import('../../api/http.js');
	const sent: unknown[] = [];
	const client = new HttpTutorClient('/', async (_url, init) => {
		const body = JSON.parse(String(init?.body));
		sent.push(body.sessionId);
		return Response.json({
			kind: 'exercise',
			requestId: body.requestId,
			attemptId: 'attempt',
			result: 'korrekt',
			feedback: 'OK',
			evidence: []
		});
	});
	const submit = (binding: typeof attempt) =>
		client.evaluateExercise({
			kind: 'exercise',
			requestId: crypto.randomUUID(),
			task,
			answer: { kind: 'text', text: '8' },
			...binding
		});
	await submit(attempt);
	sessions.reset(task);
	await submit(sessions.beginAttempt(task));
	assert.deepEqual(sent, ['sess-1', undefined]);
});

test('partial evidence confirms a step while keeping the task open', () => {
	const full = {
		kind: 'exercise',
		requestId: 'r',
		attemptId: 'a',
		feedback: 'OK',
		result: 'korrekt',
		evidence: []
	} as const;
	const response = { ...full, evidence: [] };
	assert.equal(countsAsTaskCompletion(response), true);
	assert.equal(countsAsTaskCompletion({ ...response, evidenceScope: 'vollstaendig' }), true);
	assert.equal(countsAsTaskCompletion({ ...response, evidenceScope: 'teilaspekt' }), false);
	const item = {
		kind: 'abruf',
		taskId: 't',
		id: 'e',
		learningGoalId: 'g',
		helpLevel: 0,
		recordedAt: '2026-11-28T08:00:00Z',
		evidenceScope: 'teilaspekt'
	} as const;
	assert.equal(countsAsTaskCompletion({ ...response, evidence: [item] }), false);
});

test('an attempt retains the highest help across closed and newer sessions', async () => {
	const { ExerciseSessions, helpForMove } = await import('../tutor/sessionStore.js');
	const task = exercises[0].task;
	for (const [first, second, expected] of [
		['nachhaken', 'kontrastfall', 'B'],
		['kontrastfall', 'nachhaken', 'A'],
		['kontrastfall', 'kontrastfall', 'B']
	] as const) {
		const sessions = new ExerciseSessions();
		const attempt = sessions.beginAttempt(task);
		sessions.start(task, 'A');
		sessions.recordHelp(task, 'A', helpForMove(first));
		sessions.close(task, 'A');
		sessions.start(task, 'B');
		sessions.recordHelp(task, 'B', helpForMove(second));
		assert.equal(attempt.sessionId, expected);
		assert.equal(sessions.beginAttempt(task).sessionId, expected);
		sessions.reset(task);
		assert.equal(sessions.beginAttempt(task).sessionId, undefined);
	}
});
