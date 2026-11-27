import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
const hooks = registerHooks({
	resolve(specifier, context, next) {
		return next(specifier === './companion-logic.js' ? './companion-logic.ts' : specifier, context);
	}
});
const { contextLine, makeRequest, sameCompanionContent, visitFor } =
	await import('./companion-logic.js');
hooks.deregister();
import type { AgentContextSnapshot } from '../../memory/types.js';
const task = { taskId: 'eins', courseId: 'kurs', courseVersion: '1' };
const snapshot: AgentContextSnapshot = {
	visibleScreen: {
		route: '/uebungen',
		taskRef: task,
		updatedAt: 1,
		isIndependentProbe: false,
		sectionTitle: 'Abstieg'
	},
	recentHistory: [],
	savedNotesAndQuestions: [],
	inferredInterests: [],
	dwellStats: [],
	capturedAt: 1
};
test('Aufgabe und Revision bleiben erhalten, der lokale Client erhält den Kontext zur Probenprüfung', () => {
	const turn = makeRequest(snapshot, 'Warum?', 'session', 2);
	assert.deepEqual(turn?.task, task);
	assert.equal(turn?.expectedRevision, 2);
	assert.equal(turn?.agentContext, snapshot);
});
test('Probe erzeugt weder Besuch noch Turn, eine Seite ohne Aufgabe bekommt keine Ersatzaufgabe', () => {
	const probe = {
		...snapshot,
		visibleScreen: { ...snapshot.visibleScreen, isIndependentProbe: true }
	};
	assert.equal(visitFor(probe.visibleScreen), undefined);
	assert.equal(makeRequest(probe, '?', 's', 0), undefined);
	assert.equal(
		makeRequest(
			{ ...snapshot, visibleScreen: { ...snapshot.visibleScreen, taskRef: undefined } },
			'?',
			's',
			0
		),
		undefined
	);
});
test('Kontextkopf verbindet den Term mit der aktiven Zeit genau dieses Inhalts', () => {
	const visit = {
		id: 'id',
		kind: 'exercise' as const,
		contentId: 'eins',
		route: '/uebungen',
		lastVisitedAt: 1,
		visits: 1,
		depth: 0
	};
	assert.equal(
		contextLine({
			...snapshot,
			visibleScreen: { ...snapshot.visibleScreen, termLabel: 'Q' },
			recentHistory: [visit],
			dwellStats: [{ id: 'id', route: '/uebungen', activeSeconds: 8.8 }]
		}),
		'Q · 8 s Lesezeit'
	);
});

test('Kapitel und Lesezeit erhalten den Dialog, Inhaltswechsel und Probe schließen ihn', () => {
	const a = {
		...snapshot.visibleScreen,
		media: { kind: 'audio' as const, id: 'episode', title: 'Podcast', chapter: 'Einstieg' }
	};
	assert.ok(
		sameCompanionContent(a, { ...a, updatedAt: 2, media: { ...a.media, chapter: 'Fortsetzung' } })
	);
	for (const b of [
		{ ...a, route: '/' },
		{ ...a, media: { ...a.media, id: 'andere' } },
		{ ...a, isIndependentProbe: true },
		{ ...a, taskRef: undefined }
	])
		assert.equal(sameCompanionContent(a, b), false);
});
