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
	confidenceModeForHeight,
	digitsComplete,
	emptyAnswer,
	exerciseScreen,
	linesText,
	stageOf,
	stageProblems
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
