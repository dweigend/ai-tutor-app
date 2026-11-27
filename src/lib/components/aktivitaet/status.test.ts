import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import type { LearningEvidence } from '../../api/types.js';

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (/^\.\.?\//.test(specifier) && specifier.endsWith('.js')) {
			return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
		}
		return nextResolve(specifier, context);
	}
});

const { conceptEvidence, resolveConceptStatus } = await import('./mirror.js');
const concept = { learningGoalId: 'lz-rechengraph-gradienten', status: 'übertragbar' } as const;
const course = { courseId: 'ki-selbst-bauen', courseVersion: '0.1.0' };
const oldDate = '2026-11-26T08:00:00.000Z';
const newDate = '2026-11-27T08:00:00.000Z';
const transferTask = 'a-bp-preiskette-transfer';
const older: LearningEvidence = {
	id: 'old-evidence',
	taskId: 'a-bp-addieren-erklaeren',
	learningGoalId: concept.learningGoalId,
	kind: 'anwendung',
	helpLevel: 0,
	recordedAt: oldDate
};
const transfer: LearningEvidence = {
	...older,
	id: 'new-evidence',
	attemptId: 'latest',
	taskId: transferTask,
	kind: 'transfer',
	recordedAt: newDate
};

test('only mock mode uses the seed when this goal has no evidence', () => {
	const unrelated = [{ ...older, learningGoalId: 'other', result: 'korrekt' }];
	assert.equal(resolveConceptStatus(concept, unrelated, 'http'), 'noch_zu_wenig_gesehen');
	assert.equal(resolveConceptStatus(concept, unrelated, 'mock'), 'übertragbar');
});

test('practice without evidence can supersede an older success in either mode', () => {
	const cases = [
		['falsch', 'nicht_gekonnt'],
		['teilweise', 'eingereicht_ungeprueft'],
		['nicht_pruefbar_oder_alternativweg', 'eingereicht_ungeprueft']
	] as const;
	for (const [result, expected] of cases) {
		// The extended result can arrive from the API before the shared type changes.
		const practice = {
			kind: 'exercise' as const,
			id: 'latest',
			itemId: transferTask,
			result,
			recordedAt: newDate
		};
		const evidence = conceptEvidence([{ course, recentPractice: [practice], evidence: [older] }]);
		for (const mode of ['mock', 'http'] as const) {
			assert.equal(resolveConceptStatus(concept, evidence, mode), expected);
		}
	}
});

test('standalone dialog evidence retains its verdict even without recent practice', () => {
	const dialog: LearningEvidence = {
		...older,
		id: 'dialog:1',
		kind: 'fehlerfund',
		evidenceLevel: 'nachgewiesener_fehler'
	};
	for (const [item, expected] of [
		[dialog, 'nicht_gekonnt'],
		[{ ...dialog, result: 'korrekt' }, 'nicht_gekonnt'],
		[older, 'eingereicht_ungeprueft'],
		[{ ...older, result: 'korrekt' }, 'einmal_gelungen']
	] as const) {
		const observations = conceptEvidence([{ course, recentPractice: [], evidence: [item] }]);
		assert.equal(resolveConceptStatus(concept, observations, 'http'), expected);
	}
});

test('the recorded result takes precedence over an attached transfer marker', () => {
	const evidence = conceptEvidence([
		{
			course,
			recentPractice: [
				{
					kind: 'exercise',
					id: 'latest',
					itemId: transferTask,
					result: 'falsch',
					recordedAt: newDate
				}
			],
			evidence: [transfer, older]
		}
	]);
	assert.equal(resolveConceptStatus(concept, evidence, 'http'), 'nicht_gekonnt');
});

test('transfer requires a later correct attempt on a new task without help', () => {
	const earlier = { ...older, result: 'korrekt' };
	const latest = { ...transfer, result: 'korrekt' };
	assert.equal(resolveConceptStatus(concept, [latest], 'http'), 'einmal_gelungen');
	assert.equal(resolveConceptStatus(concept, [earlier, latest], 'http'), 'übertragbar');
	assert.equal(
		resolveConceptStatus(concept, [earlier, { ...latest, helpLevel: 1 }], 'http'),
		'mit_hilfe_gelungen'
	);
	assert.equal(
		resolveConceptStatus(concept, [{ ...earlier, helpLevel: 2 }, latest], 'http'),
		'einmal_gelungen'
	);
	assert.equal(
		resolveConceptStatus(concept, [earlier, { ...latest, kind: 'anwendung' }], 'http'),
		'beherrscht'
	);
	assert.equal(
		resolveConceptStatus(concept, [{ ...earlier, taskId: transferTask }, latest], 'http'),
		'beherrscht'
	);
	assert.equal(
		resolveConceptStatus(concept, [latest, { ...earlier, recordedAt: newDate }], 'http'),
		'einmal_gelungen'
	);
});

test('a correct answer after an explanation is help, not mastery', () => {
	const helped = { ...older, helpLevel: 4 as const, result: 'korrekt' };
	const status = resolveConceptStatus(concept, [helped], 'http');
	assert.equal(status, 'mit_hilfe_gelungen');
	assert.notEqual(status, 'beherrscht');
});

test('partial knowledge without help never counts as success with help', () => {
	const partial = { ...older, helpLevel: 0 as const, result: 'teilweise' };
	assert.equal(resolveConceptStatus(concept, [partial], 'http'), 'teilweise_gelungen');
	assert.equal(
		resolveConceptStatus(concept, [{ ...partial, helpLevel: 1 as const }], 'http'),
		'mit_hilfe_gelungen'
	);
});

test('a later independent transfer on a new task after independent success is transferable', () => {
	const helpedFirst = { ...older, helpLevel: 4 as const, result: 'korrekt' };
	const independentFirst = { ...older, helpLevel: 0 as const, result: 'korrekt' };
	const later = { ...transfer, helpLevel: 0 as const, result: 'korrekt' };
	assert.equal(resolveConceptStatus(concept, [helpedFirst], 'http'), 'mit_hilfe_gelungen');
	assert.equal(resolveConceptStatus(concept, [independentFirst, later], 'http'), 'übertragbar');
	assert.equal(resolveConceptStatus(concept, [helpedFirst, later], 'http'), 'einmal_gelungen');
});

const practice = {
	kind: 'exercise' as const,
	id: 'latest',
	itemId: transferTask,
	result: 'korrekt',
	recordedAt: newDate
};

test('legacy evidence matches equivalent UTC times and preserves help level 2', () => {
	const item = {
		...transfer,
		attemptId: undefined,
		helpLevel: 2 as const,
		recordedAt: newDate.replace('Z', '+00:00')
	};
	const evidence = conceptEvidence([{ course, recentPractice: [practice], evidence: [item] }]);
	assert.equal(evidence.length, 1);
	assert.equal(resolveConceptStatus(concept, evidence, 'http'), 'mit_hilfe_gelungen');
});

test('evidence ID prefix identifies the attempt even when another attempt shares its timestamp', () => {
	const item = { ...transfer, attemptId: undefined, id: practice.id + ':1' };
	const evidence = conceptEvidence([
		{
			course,
			recentPractice: [
				{ ...practice, id: 'other' },
				{ ...practice, result: 'falsch' }
			],
			evidence: [item]
		}
	]);
	assert.equal(evidence.find((entry) => entry.kind === 'transfer')?.result, 'falsch');
});

test('practice evidenceLevel supersedes a legacy correct result', () => {
	const evidence = conceptEvidence([
		{
			course,
			recentPractice: [{ ...practice, evidenceLevel: 'nicht_pruefbar_oder_alternativweg' }],
			evidence: [transfer]
		}
	]);
	assert.equal(resolveConceptStatus(concept, evidence, 'http'), 'eingereicht_ungeprueft');
});

test('a practice entry without a help level cannot establish independent mastery or transfer', () => {
	const evidence = conceptEvidence([{ course, recentPractice: [practice], evidence: [] }]);
	assert.equal(resolveConceptStatus(concept, evidence, 'http'), 'eingereicht_ungeprueft');
	const later = {
		...older,
		recordedAt: '2026-11-28T08:00:00Z',
		kind: 'transfer' as const,
		result: 'korrekt'
	};
	assert.equal(resolveConceptStatus(concept, [...evidence, later], 'http'), 'einmal_gelungen');
});

test('mastery needs two independent successes at distinct moments', () => {
	const first = { ...older, result: 'korrekt' };
	const sameMoment = { ...first, recordedAt: oldDate.replace('Z', '+00:00') };
	assert.equal(resolveConceptStatus(concept, [first], 'http'), 'einmal_gelungen');
	assert.equal(resolveConceptStatus(concept, [sameMoment, first], 'http'), 'einmal_gelungen');
	assert.equal(
		resolveConceptStatus(concept, [{ ...first, recordedAt: newDate }, first], 'http'),
		'beherrscht'
	);
});
