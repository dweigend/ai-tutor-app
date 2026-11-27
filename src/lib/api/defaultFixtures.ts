import type { MockFixtures } from './mock.js';

export const demoCourse = { courseId: 'ki-selbst-bauen', courseVersion: '0.1.0' };
export const demoTask = { ...demoCourse, taskId: 'a-m1-fehlermass-gerade' };
export const demoTutorialId = 'attention-skalierung';
export const demoCheckId = 'gewicht-vorhersagen';

export const defaultFixtures: MockFixtures = {
	scenarios: [
		{
			id: 'fehlermass-gerade',
			task: demoTask,
			title: 'Welche Gerade passt?',
			setup: 'Du vergleichst drei Geraden an fünf Messpunkten.',
			delegation: {
				learner: ['Eine Gerade auswählen und den Fehler selbst berechnen.'],
				tutorMay: ['Einen Rechenschritt an einem anderen Zahlenpaar zeigen.']
			},
			parallelExample: {
				move: 'beispiel_zeigen',
				text: 'Bei einem Messwert von 7 und einer Vorhersage von 5 ist die Abweichung −2. Quadriert ergibt sie 4.'
			},
			whiteboardPrompt: {
				move: 'nachhaken',
				text: 'Welche Strecke in deiner Skizze zeigt die Abweichung von der Geraden?'
			},
			steps: [
				{
					id: 'prediction',
					prompt: {
						move: 'vorhersage_verlangen',
						text: 'Welche Gerade passt deiner Vermutung nach am besten zu den fünf Messpunkten?'
					},
					quickReplies: [
						{
							id: 'candidate',
							label: 'Ich tippe auf y = 2x.',
							input: { kind: 'answer', text: 'y = 2x' }
						}
					],
					nextStepId: 'error'
				},
				{
					id: 'error',
					prompt: {
						move: 'nachhaken',
						text: 'Wie würdest du Abweichungen auf beiden Seiten der Geraden zusammenfassen?'
					},
					diagnoses: [
						{
							id: 'fv-vorzeichen',
							trigger: { kind: 'contains', phrases: ['addier'] },
							reply: {
								move: 'gestufter_hinweis',
								text: 'Stell dir die Abweichungen +2 und −2 vor. Was sagt ihre Summe über die Passung aus?'
							},
							nextStepId: 'error'
						}
					],
					nextStepId: 'transfer'
				},
				{
					id: 'transfer',
					prompt: {
						move: 'transfer_stellen',
						text: 'Was ändert sich am mittleren quadratischen Fehler, wenn du alle fünf Abweichungen verdoppelst?'
					},
					diagnoses: [
						{
							id: 'eigenversuch',
							trigger: { kind: 'text', accepted: ['Ich rechne kurz.'] },
							reply: { move: 'warten' },
							nextStepId: 'transfer'
						}
					]
				}
			]
		}
	],
	tutorials: [
		{
			course: demoCourse,
			tutorialId: demoTutorialId,
			checkId: demoCheckId,
			learningGoalId: 'lz-softmax-kreuzentropie-erklaeren',
			rules: [
				{
					accepted: { kind: 'choice', optionIds: ['flacher'] },
					result: 'korrekt',
					feedback: 'Die Gewichte rücken zusammen. Ihre Reihenfolge bleibt erhalten.'
				}
			],
			feedback: 'Vergleiche, wie groß die Abstände zwischen den Scores nach dem Teilen sind.'
		}
	],
	exercises: [
		{
			task: demoTask,
			rules: [
				{
					accepted: { kind: 'choice', optionIds: ['2x'] },
					result: 'korrekt',
					feedback:
						'Unter den Kandidaten hat diese Gerade den kleinsten mittleren quadratischen Fehler.'
				},
				{
					accepted: { kind: 'text', text: '0,022' },
					result: 'korrekt',
					feedback: 'Der mittlere quadratische Fehler von y = 2x beträgt 0,022.'
				},
				{
					accepted: { kind: 'text', text: '0,11' },
					result: 'teilweise',
					feedback:
						'Die Summe der quadrierten Fehler stimmt. Teile sie noch durch die Anzahl der Messpunkte.'
				}
			],
			feedback:
				'Berechne für jeden Messpunkt die quadrierte Abweichung und bilde daraus den Mittelwert.',
			evidence: [
				{ learningGoalId: 'lz-lernen-als-optimierung-erklaeren', kind: 'anwendung', helpLevel: 0 }
			]
		}
	]
};
