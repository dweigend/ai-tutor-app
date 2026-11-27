import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
const hooks = registerHooks({
	resolve(specifier, context, next) {
		return next(specifier === './sessionStore.js' ? './sessionStore.ts' : specifier, context);
	}
});
const { acceptsTurn, requiresConsentRestart, selectScenario } = await import('./sessionStore.js');
hooks.deregister();

const scenarios = [
	{ id: 'eins', task: { taskId: 'a' } },
	{ id: 'zwei', task: { taskId: 'b' } },
	{ id: 'freie-frage', course: { courseId: 'k', courseVersion: '1' } }
];
test('Einstieg über Szenario, Aufgabe, Whiteboard-Rückweg und gespeicherte Sitzung', () => {
	for (const query of ['szenario=zwei', 'aufgabe=b', 'scenario=zwei']) {
		assert.equal(selectScenario(scenarios, new URLSearchParams(query), 'eins'), scenarios[1]);
	}
	assert.equal(selectScenario(scenarios, new URLSearchParams(), 'zwei'), scenarios[1]);
	assert.equal(selectScenario(scenarios, new URLSearchParams('szenario=x'), null), scenarios[0]);
});
test('Freie Kursfrage lässt sich öffnen und nach Navigation fortsetzen', () => {
	const free = scenarios[2];
	assert.equal(selectScenario(scenarios, new URLSearchParams('szenario=freie-frage'), null), free);
	assert.equal(selectScenario(scenarios, new URLSearchParams(), free.id), free);
	assert.equal(selectScenario(scenarios, new URLSearchParams('aufgabe=b'), free.id), scenarios[1]);
});
const request = { requestId: 'first', sessionId: 'demo', expectedRevision: 2 };
const response = { requestId: 'first', session: { id: 'demo', revision: 3 } };
test('Nur die passende Bestätigung darf den Zug abschließen und seine Karte zeigen', () => {
	assert.ok(acceptsTurn(request, response, 'first', 2, false));
	for (const active of [undefined, 'next'])
		assert.equal(acceptsTurn(request, response, active, 2, false), false);
	assert.equal(acceptsTurn(request, response, 'first', 2, true), false);
	assert.equal(acceptsTurn(request, response, 'first', 3, false), false);
	assert.equal(acceptsTurn(request, { ...response, requestId: 'other' }, 'first', 2, false), false);
	assert.equal(
		acceptsTurn(request, { ...response, session: { id: 'other', revision: 3 } }, 'first', 2, false),
		false
	);
	assert.equal(
		acceptsTurn(request, { ...response, session: { id: 'demo', revision: 4 } }, 'first', 2, false),
		false
	);
});

test('Confirmation records a late artifact, while only an open dock mounts its focusable overlay', () => {
	const source = readFileSync(new URL('./TutorSession.svelte', import.meta.url), 'utf8');
	const confirm = source.slice(
		source.indexOf('function confirm('),
		source.indexOf('function clearSentSketch(')
	);
	assert.match(confirm, /entries\.push\(confirmed, reply\)/);
	assert.match(confirm, /artifact = response\.artifact/);
	assert.doesNotMatch(confirm, /expanded\s*=|\.focus\(/);
	assert.match(
		source,
		/\{#if expanded\}\s*<div class="dock"[^>]*>\s*\{#if artifact\}\s*<ArtifactOverlay/
	);
});

test('Ein Wechsel der HTTP-Freigabe erfordert eine neue Sitzung für den offenen Zug', () => {
	const task = { courseId: 'c', courseVersion: '1', taskId: 't' };
	const turn = { ...request, task, input: { kind: 'message' as const, text: 'Frage' } };
	const agentContext = {
		visibleScreen: { route: '/tutor', updatedAt: 1, isIndependentProbe: false },
		capturedAt: 1,
		recentHistory: [],
		dwellStats: [],
		savedNotesAndQuestions: [],
		inferredInterests: []
	};
	for (const original of [false, true]) {
		const pending = original ? { ...turn, agentContext } : turn;
		assert.equal(requiresConsentRestart(pending, 'http', original), false);
		assert.equal(requiresConsentRestart(pending, 'http', !original), true);
		assert.equal(requiresConsentRestart(pending, 'mock', !original), false);
	}
});

test('Eine neue Sitzung behält den neuen Entwurf und stellt den alten Text nur im leeren Feld wieder her', () => {
	const source = readFileSync(new URL('./TutorSession.svelte', import.meta.url), 'utf8');
	const restart = source.slice(
		source.indexOf('function restart()'),
		source.indexOf('function abort()')
	);
	const failedTurn = { learner: { via: 'free', text: 'Alte Nachricht' } };
	for (const [draft, expected] of [
		['Neuer Entwurf', 'Neuer Entwurf'],
		['', 'Alte Nachricht']
	]) {
		const state = {
			draft,
			live: failedTurn as typeof failedTurn | null,
			newSession: () => {
				state.live = null;
			}
		};
		runInNewContext(restart + '\nrestart();', state);
		assert.equal(state.live, null);
		assert.equal(state.draft, expected);
	}
});

test('Eine freie Frage bleibt eine Nachricht, auch mit gesetzter Sicherheit; nur der Antwortmodus wird bewertet', async () => {
	const scriptHooks = registerHooks({
		resolve(specifier, context, next) {
			return next(specifier === './script.js' ? './script.ts' : specifier, context);
		}
	});
	const { draftInput } = await import('./script.js');
	scriptHooks.deregister();
	assert.deepEqual(draftInput('Warum?', 'message'), { kind: 'message', text: 'Warum?' });
	assert.deepEqual(draftInput('Warum?', 'message', 80), { kind: 'message', text: 'Warum?' });
	assert.deepEqual(draftInput('42', 'answer'), { kind: 'answer', text: '42' });
	assert.deepEqual(draftInput('42', 'answer', 60), { kind: 'answer', text: '42', confidence: 60 });

	// The page sends through draftInput with its explicit mode and starts each line as a question.
	const source = readFileSync(new URL('./TutorSession.svelte', import.meta.url), 'utf8');
	const sendDraft = source.slice(
		source.indexOf('function sendDraft('),
		source.indexOf('function sendSketch(')
	);
	assert.match(sendDraft, /draftInput\(text, mode, confidence\)/);
	assert.match(sendDraft, /mode = 'message'/);
	assert.doesNotMatch(sendDraft, /confidence === undefined \?/);
});
