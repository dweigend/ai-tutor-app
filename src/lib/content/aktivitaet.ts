import type { CourseRef, TaskRef } from '../api/types.js';
import type { ActivityConcept, ActivityMirrorSeed } from './types.js';

// Demo state for /aktivitaet. Constructed, not an empirical dataset.

const course: CourseRef = { courseId: 'ki-selbst-bauen', courseVersion: '0.1.0' };

function task(taskId: string): TaskRef {
	return { ...course, taskId };
}

export const activityStatusCopy: Readonly<
	Record<ActivityConcept['status'] | 'eingereicht_ungeprueft', { label: string }>
> = {
	eingereicht_ungeprueft: { label: 'Eingereicht' },
	noch_zu_wenig_gesehen: { label: 'Noch zu wenig gesehen' },
	nicht_gekonnt: { label: 'Wackelt noch' },
	einmal_gelungen: { label: 'Einmal selbstständig' },
	teilweise_gelungen: { label: 'Teilweise gelungen' },
	mit_hilfe_gelungen: { label: 'Mit Hilfe' },
	beherrscht: { label: 'Sitzt' },
	übertragbar: { label: 'Sitzt sicher' }
};

export const activityQueueTopics: Readonly<
	Record<
		string,
		{
			title: string;
			route: string;
			type: 'exercise' | 'magazine';
		}
	>
> = {
	'gradient-akkumulieren': {
		title: 'Gradienten addieren',
		route: '/uebungen?task=a-bp-addieren-erklaeren',
		type: 'exercise'
	},
	kettenregel: {
		title: 'Kettenregel',
		route: '/uebungen?task=a-bp-skizze-rechengraph',
		type: 'exercise'
	},
	rechengraph: {
		title: 'Rechengraph',
		route: '/uebungen?task=a-bp-preiskette-transfer',
		type: 'exercise'
	},
	gradientencheck: {
		title: 'Gradienten prüfen',
		route: '/uebungen?task=a-bp-ki-backward-pruefen',
		type: 'exercise'
	},
	lernrate: {
		title: 'Lernrate',
		route: '/uebungen?task=a-gd-lernrate-auswahl',
		type: 'exercise'
	},
	'numerische-ableitung': {
		title: 'Schrittweite',
		route: '/magazin/die-gruene-lampe-luegt',
		type: 'magazine'
	},
	softmax: {
		title: 'Softmax',
		route: '/magazin/wie-sicher-sind-sie',
		type: 'magazine'
	},
	kalibrierung: {
		title: 'Kalibrierung',
		route: '/magazin/wie-sicher-sind-sie#sicher-menschen',
		type: 'magazine'
	}
};

export const activityMirror: ActivityMirrorSeed = {
	course,
	concepts: [
		{
			conceptId: 'gradient-akkumulieren',
			learningGoalId: 'lz-rechengraph-gradienten',
			label: 'Beiträge addieren (+=)',
			status: 'mit_hilfe_gelungen',
			attemptId: 'v-2026-11-12-dgrad-v2',
			criterion: 'd.grad = 8 erst nach Hinweis 2 mit beiden Beiträgen bestimmt.',
			nextPractice: 'Abrufkarte ohne Hilfe am 27. November.'
		},
		{
			conceptId: 'kettenregel',
			learningGoalId: 'lz-rechengraph-gradienten',
			label: 'Kettenregel im Rechengraphen',
			status: 'beherrscht',
			attemptId: 'v-2026-11-19-agrad',
			criterion: 'a.grad = −12 bei neuen Werten ohne Hilfe, sieben Tage nach dem Lernen.'
		},
		{
			conceptId: 'rechengraph',
			learningGoalId: 'lz-rechengraph-gradienten',
			label: 'Rechengraph in neuem Kontext',
			status: 'übertragbar',
			attemptId: 'v-2026-11-21-preiskette',
			criterion: 'Preiskette im Onlineshop: 0,476 € je Prozentpunkt Aufschlag, ohne Hilfe.'
		},
		{
			conceptId: 'gradientencheck',
			learningGoalId: 'lz-ki-backprop-pruefen',
			label: 'KI-Code für backward prüfen',
			status: 'nicht_gekonnt',
			attemptId: 'v-2026-11-20-produktregel',
			criterion: 'Nur x · x als Prüffall gewählt. Die vertauschten Faktoren blieben unentdeckt.',
			nextPractice: 'Einen Prüffall mit zwei verschiedenen Faktoren selbst bauen.'
		},
		{
			conceptId: 'lernrate',
			learningGoalId: 'lz-lernrate-erklaeren',
			label: 'Lernrate und Pendeln',
			status: 'beherrscht',
			attemptId: 'v-2026-11-18-probe',
			criterion: 'Eigenständige Probe: w₂ = 1,92 ohne Tutor, sechs Tage nach dem Lernen.'
		},
		{
			conceptId: 'numerische-ableitung',
			learningGoalId: 'lz-gradientenfehler-finden',
			label: 'Schrittweite h wählen',
			status: 'noch_zu_wenig_gesehen',
			nextPractice: 'Kurze Probe: Warum ist h = 10^-12 nicht genauer als h = 10^-6?'
		},
		{
			conceptId: 'softmax',
			learningGoalId: 'lz-softmax-kreuzentropie-erklaeren',
			label: 'Softmax und Skalierung',
			status: 'noch_zu_wenig_gesehen',
			nextPractice: 'Erst ein Beispiel mit Lücke, dann eine eigene Vorhersage zu [20, 10, 0].'
		},
		{
			conceptId: 'kalibrierung',
			learningGoalId: 'lz-softmax-kreuzentropie-erklaeren',
			label: 'Sicherheit und Trefferquote',
			status: 'noch_zu_wenig_gesehen',
			nextPractice: 'Eine Vorhersage mit Sicherheitsangabe, die später nachgezählt wird.'
		}
	],
	observations: [
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-12-dgrad-v1',
			task: task('a-bp-mehrfachnutzung-vorhersagen'),
			recordedAt: '2026-11-12T15:40:00Z',
			outcome: 'falsch',
			helpLevel: 0,
			confidenceBefore: 80,
			criterion: 'd hat im ersten Versuch nur einen Beitrag (4 statt 8).',
			evidenceKind: 'vorhersage',
			transferDistance: 'near'
		},
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-12-dgrad-v2',
			task: task('a-bp-mehrfachnutzung-vorhersagen'),
			recordedAt: '2026-11-12T15:52:00Z',
			outcome: 'korrekt',
			helpLevel: 2,
			criterion: 'Nach Hinweis 2 beide Pfade getrennt betrachtet und addiert.',
			evidenceKind: 'vorhersage',
			transferDistance: 'near'
		},
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-18-probe',
			task: task('a-gd-lernrate-auswahl'),
			recordedAt: '2026-11-18T09:15:00Z',
			outcome: 'korrekt',
			helpLevel: 0,
			confidenceBefore: 55,
			criterion: 'w₂ = 1,92 in der bewerteten Umgebung ohne Tutor.',
			evidenceKind: 'anwendung',
			elapsedSinceLearningDays: 6,
			transferDistance: 'near'
		},
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-19-agrad',
			task: task('a-bp-mehrfachnutzung-vorhersagen'),
			recordedAt: '2026-11-19T17:05:00Z',
			outcome: 'korrekt',
			helpLevel: 0,
			confidenceBefore: 70,
			criterion: 'Neue Werte a = 1, b = −2, c = 5: d.grad = 6 und a.grad = −12.',
			evidenceKind: 'anwendung',
			elapsedSinceLearningDays: 7,
			transferDistance: 'near'
		},
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-20-produktregel',
			task: task('a-bp-ki-backward-pruefen'),
			recordedAt: '2026-11-20T14:30:00Z',
			outcome: 'falsch',
			helpLevel: 0,
			confidenceBefore: 85,
			criterion: 'Prüffall mit gleichen Faktoren gewählt; der Fehler blieb verborgen.',
			evidenceKind: 'fehlerfund',
			priorModelExposure: true,
			transferDistance: 'near'
		},
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-21-preiskette',
			task: task('a-bp-preiskette-transfer'),
			recordedAt: '2026-11-21T10:20:00Z',
			outcome: 'korrekt',
			helpLevel: 0,
			confidenceBefore: 60,
			criterion: '∂P/∂s = 47,6 € je Einheit, also 0,476 € je Prozentpunkt.',
			evidenceKind: 'transfer',
			elapsedSinceLearningDays: 9,
			transferDistance: 'far'
		},
		{ kind: 'seen', recordedAt: '2026-11-22T19:00:00Z' },
		{ kind: 'solution-seen', recordedAt: '2026-11-23T18:45:00Z' },
		{
			kind: 'attempted',
			attemptId: 'v-2026-11-24-leer',
			task: task('a-m5-softmax-kreuzentropie'),
			recordedAt: '2026-11-24T20:10:00Z',
			// An empty submission carries no subject-matter finding.
			outcome: 'nicht_beurteilbar',
			helpLevel: 0
		}
	],
	monthlyPoints: [
		{
			month: '2026-10',
			points: [
				{ date: '2026-10-06', kind: 'practiced', conceptIds: ['fehlermass'] },
				{ date: '2026-10-09', kind: 'practiced', conceptIds: ['ableitung-als-steigung'] },
				{ date: '2026-10-15', kind: 'practiced', conceptIds: ['numerische-ableitung'] },
				{ date: '2026-10-23', kind: 'practiced', conceptIds: ['gradientenabstieg', 'lernrate'] },
				{ date: '2026-10-29', kind: 'practiced', conceptIds: ['lernrate'] }
			]
		},
		{
			month: '2026-11',
			points: [
				{ date: '2026-11-03', kind: 'practiced', conceptIds: ['rechengraph'] },
				{ date: '2026-11-05', kind: 'practiced', conceptIds: ['kettenregel'] },
				{ date: '2026-11-12', kind: 'practiced', conceptIds: ['gradient-akkumulieren'] },
				{ date: '2026-11-18', kind: 'practiced', conceptIds: ['lernrate'] },
				{ date: '2026-11-19', kind: 'practiced', conceptIds: ['kettenregel'] },
				{ date: '2026-11-20', kind: 'practiced', conceptIds: ['gradientencheck'] },
				{ date: '2026-11-21', kind: 'practiced', conceptIds: ['rechengraph'] },
				{ date: '2026-11-22', kind: 'practiced', conceptIds: ['softmax'] },
				{ date: '2026-11-24', kind: 'practiced', conceptIds: ['softmax'] },
				{ date: '2026-11-27', kind: 'planned', conceptIds: ['gradient-akkumulieren'] },
				{
					date: '2026-11-30',
					kind: 'planned',
					conceptIds: ['gradientencheck', 'numerische-ableitung']
				}
			]
		},
		{
			month: '2026-12',
			points: [
				{ date: '2026-12-04', kind: 'planned', conceptIds: ['softmax', 'kalibrierung'] },
				{ date: '2026-12-10', kind: 'planned', conceptIds: ['kettenregel'] }
			]
		}
	]
};
