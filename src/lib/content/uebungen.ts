import type { EvidenceKind, TaskRef } from '../api/types.js';
import type { MockFixtures } from '../api/mock.js';
import { formulaRef } from '../math/editorial-formulas.js';
import { repoSource } from './sources.js';
import type { ExerciseCheckRule, ExerciseItem, StageFacts } from './types.js';

// 1 = short entry, 2 = careful check, 3 = deep dive or independent probe.
export type EditorialExercise = ExerciseItem & { level: 1 | 2 | 3; subtitle: string };

// Mock rules only know `korrekt` and `teilweise`. Diagnostic feedback for every option,
// including the wrong ones, lives in `optionFeedback` for the UI to show after submission.
export type ExerciseCheckFixture = MockFixtures['exercises'][number] & {
	optionFeedback?: Readonly<Record<string, string>>;
};

const COURSE_VERSION = '0.1.0';

function aiTask(taskId: string): TaskRef {
	return { courseId: 'ki-selbst-bauen', courseVersion: COURSE_VERSION, taskId };
}

function pythonTask(taskId: string): TaskRef {
	return { courseId: 'python-einstieg', courseVersion: COURSE_VERSION, taskId };
}

function taskSource(label: string, task: TaskRef) {
	return repoSource(label, `pakete/kurse/${task.courseId}/aufgaben/${task.taskId}.yaml`);
}

function options(...entries: readonly (readonly [id: string, label: string])[]) {
	return entries.map(([id, label]) => ({ id, label }));
}

function choiceRule(
	optionIds: readonly string[],
	feedback: string,
	partial = false
): ExerciseCheckRule {
	return {
		accepted: { kind: 'choice', optionIds: [...optionIds] },
		result: partial ? 'teilweise' : 'korrekt',
		feedback
	};
}

function textRule(
	texts: readonly string[],
	feedback: string,
	partial = false
): ExerciseCheckRule[] {
	return texts.map((text) => ({
		accepted: { kind: 'text', text },
		result: partial ? 'teilweise' : 'korrekt',
		feedback
	}));
}

function evidence(learningGoalId: string, kind: EvidenceKind) {
	return { learningGoalId, kind, helpLevel: 0 } as const;
}

const learningRateTask = aiTask('a-gd-schritte-vorhersagen');
const accumulatorTask = pythonTask('a-akkumulator-vorhersagen');
const retrievalTask = aiTask('a-bp-addieren-erklaeren');
const aiBackwardTask = aiTask('a-bp-ki-backward-pruefen');
const aiAverageTask = pythonTask('a-ki-durchschnitt-pruefen');
const landscapeTask = aiTask('a-gd-kontrast-gradientenrichtung');
const priceChainTask = aiTask('a-bp-preiskette-transfer');
const graphSketchTask = aiTask('a-bp-skizze-rechengraph');
const probeTask = aiTask('a-gd-lernrate-auswahl');

// Model answers as plain code, shared by the stock Markdown and the LinePick step of the stage.
const mulBackwardCode =
	'def __mul__(self, other):\n    out = Value(self.data * other.data, (self, other))\n    def _backward():\n        # Produktregel: jeder Faktor bekommt seine Ableitung\n        self.grad += self.data * out.grad\n        other.grad += other.data * out.grad\n    out._backward = _backward\n    return out';
const averageCode =
	'def durchschnitt_ueber(werte, grenze):\n    """Berechnet den Durchschnitt aller Werte, die größer als grenze sind."""\n    summe = 0\n    for w in werte:\n        if w > grenze:\n            summe += w          # nur relevante Werte aufsummieren\n    return summe / len(werte)   # Durchschnitt bilden';

// Facts and group card of the price chain (textredaktion-v2.md §1.7), shared by both steps.
const priceFacts = {
	kind: 'cells',
	cells: [
		{ label: 'E Einkauf', value: '40 €' },
		{ label: 's Aufschlag', value: '0,5' },
		{ label: 'v Versand', value: '5 €' },
		{ label: 'm MwSt.', value: '0,19' }
	]
} as const satisfies StageFacts;
const priceGroupCard =
	'Allein rechnen. Dann die Graphen paarweise vergleichen und jeden Knoten laut erklären. Danach allein erneut antworten.';

const pythonBlock = (code: string) => `\`\`\`python\n${code}\n\`\`\``;

export const exercises: readonly EditorialExercise[] = [
	{
		task: learningRateTask,
		format: 'quick-challenge',
		level: 1,
		title: 'Wettlauf zum tiefsten Punkt',
		subtitle: 'Am selben Hang macht Programm B viermal so große Schritte.',
		minutes: 5,
		prompt:
			'f(w) = (w − 3)², Start bei w = 5. Programm A nutzt die Lernrate η = 0,25 und gibt 4, 3,5, 3,25 aus. Programm B nutzt η = 1. Welche drei Werte gibt Programm B aus? Leg dich fest, bevor du rechnest.',
		response: {
			answerKind: 'choice',
			options: options(
				['halbieren', '4, 3,5, 3,25'],
				['pendeln', '1, 5, 1'],
				['treffer', '3, 3, 3'],
				['divergiert', '−1, 11, −13']
			)
		},
		askConfidence: true,
		learningGoalIds: ['lz-lernrate-erklaeren', 'lz-gradienten-vorhersagen-kalibrieren'],
		sources: [taskSource('Aufgabe · Schritte vorhersagen', learningRateTask)],
		stage: {
			steps: [
				{
					id: 'vorhersage',
					context: `${formulaRef('gd-parabel')} · Start w = 5`,
					facts: {
						kind: 'pair',
						sides: [
							{ key: 'A', label: 'η 0,25', value: '4 · 3,5 · 3,25' },
							{ key: 'B', label: 'η 1', value: '? · ? · ?' }
						]
					},
					ask: 'Welche drei Werte gibt B aus?',
					spoken:
						'f von w gleich w minus drei, zum Quadrat. Start bei w gleich fünf. A mit eta null Komma zwei fünf gibt vier, drei Komma fünf, drei Komma zwei fünf aus. Welche drei Werte gibt B mit eta gleich eins aus?',
					instrument: {
						kind: 'choice',
						layout: 'grid',
						labels: {
							halbieren: '4 · 3,5 · 3,25',
							pendeln: '1 · 5 · 1',
							treffer: '3 · 3 · 3',
							divergiert: '−1 · 11 · −13'
						}
					}
				}
			]
		}
	},
	{
		task: accumulatorTask,
		format: 'quick-challenge',
		level: 1,
		title: 'Zwei Zeilen tauschen den Platz',
		subtitle: 'Dieselben vier Befehle, doch eine Zeile rutscht in die Schleife.',
		minutes: 5,
		prompt:
			'Programm A:\n\n```python\nsumme = 0\nfor x in [2, 3, 4]:\n    summe = summe + x\nprint(summe)\n```\n\nProgramm B:\n\n```python\nfor x in [2, 3, 4]:\n    summe = 0\n    summe = summe + x\nprint(summe)\n```\n\nWas geben die beiden Programme aus?',
		response: {
			answerKind: 'choice',
			options: options(
				['a9-b4', 'A: 9, B: 4'],
				['a9-b9', 'A: 9, B: 9'],
				['a4-b9', 'A: 4, B: 9'],
				['spur', 'A: 2 5 9, B: 2 3 4']
			)
		},
		askConfidence: true,
		learningGoalIds: [
			'lz-programm-nachvollziehen',
			'lz-akkumulator-erklaeren',
			'lz-sicherheit-einschaetzen'
		],
		sources: [taskSource('Aufgabe · Akkumulator vorhersagen', accumulatorTask)],
		stage: {
			steps: [
				{
					id: 'vorhersage',
					context: 'Python · Liste [2, 3, 4]',
					facts: {
						kind: 'code',
						sides: [
							{
								key: 'A',
								code: 'summe = 0\nfor x in [2, 3, 4]:\n    summe = summe + x\nprint(summe)'
							},
							{
								key: 'B',
								code: 'for x in [2, 3, 4]:\n    summe = 0\n    summe = summe + x\nprint(summe)'
							}
						]
					},
					ask: 'Was geben A und B aus?',
					// Program output, not sentences: the rows speak in Mono (art director, #11).
					instrument: { kind: 'choice', layout: 'rows', voice: 'value' }
				}
			]
		}
	},
	{
		task: retrievalTask,
		format: 'retrieval',
		level: 1,
		title: 'Doppelte Spur zur selben Zahl',
		subtitle: 'Aus dem Gedächtnis: Ein Wert speist beide Seiten einer Rechnung.',
		minutes: 3,
		prompt:
			'Ohne nachzusehen: L = d · d mit d = 4 und L.grad = 1. Welchen Wert hat d.grad? Schreib nur die Zahl. Die Begründung sagst du dir selbst, bevor du die Rückseite aufdeckst.',
		response: { answerKind: 'text' },
		askConfidence: true,
		learningGoalIds: ['lz-rechengraph-gradienten', 'lz-autodiff-implementieren'],
		sources: [taskSource('Aufgabe · Addieren erklären', retrievalTask)],
		stage: {
			title: 'Doppelte Spur zur selben Zahl',
			steps: [
				{
					id: 'abruf',
					context: formulaRef('backprop-quadrat'),
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'd', value: '4' },
							{ label: 'L.grad', value: '1' }
						]
					},
					ask: 'Welchen Wert hat d.grad?',
					more: 'Ohne nachzusehen. Die Begründung sagst du dir selbst, bevor die Rückseite kommt.',
					spoken:
						'L gleich d mal d. d gleich vier, L Punkt grad gleich eins. Welchen Wert hat d Punkt grad?',
					instrument: { kind: 'digits', decimals: 0, signed: true }
				}
			],
			// Proposal (#11, SpectrumSlider recipe): a local yes/no self-check after the back side.
			// Not in textredaktion v2.2; waits for the editorial pass and David's approval.
			review: {
				id: 'rueckseite',
				context: formulaRef('backprop-quadrat'),
				spoken: 'L gleich d mal d. Deckt sich deine Begründung mit der Rückseite?',
				ask: 'Deckt sich deine Begründung mit der Rückseite?',
				instrument: { kind: 'spectrum' }
			}
		}
	},
	{
		task: aiBackwardTask,
		format: 'plausible-but-wrong',
		level: 2,
		title: 'Der blinde Fleck im Prüfstand',
		subtitle: 'Die KI liefert fehlerhaften Code, den der erste Test durchwinkt.',
		minutes: 8,
		prompt:
			'Ein Sprachmodell hat dir den Rückwärtsschritt für die Multiplikation geschrieben. Dein Test mit x · x ist grün. Welche Prüffälle decken den Fehler sicher auf? Wähle alle zutreffenden.',
		modelAnswer: pythonBlock(mulBackwardCode),
		passingExample:
			'x = Value(3.0); y = x * x; y.backward() ergibt x.grad == 6.0. Der Test ist grün.',
		counterexamplePrompt:
			'Bau einen Fall, in dem dieser Code ein anderes Ergebnis liefert als die richtige Produktregel. Notiere beide Ergebnisse.',
		explanationPrompt: 'Erkläre in einem Satz, warum der Test mit x · x trotzdem grün war.',
		response: {
			answerKind: 'choice',
			multiple: true,
			options: options(
				['x-mal-x', 'x · x an der Stelle x = 3'],
				['ungleich', 'a · b mit a = 2 und b = −3'],
				['gleich', 'a · b mit a = 2 und b = 2'],
				[
					'zentral',
					'Zentrale Differenz mit h = 10^{−6} an a = 2, b = −3, jeweils mit frischen Knoten'
				]
			)
		},
		askConfidence: true,
		learningGoalIds: ['lz-ki-backprop-pruefen', 'lz-gradientenfehler-finden'],
		sources: [taskSource('Aufgabe · KI-Backward prüfen', aiBackwardTask)],
		stage: {
			steps: [
				{
					id: 'zeilen',
					context: 'KI-Code · Multiplikation rückwärts',
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'Test', value: 'x · x' },
							{ label: 'x', value: '3' },
							{ label: 'x.grad', value: '6.0' },
							{ label: 'Status', value: 'grün' }
						]
					},
					ask: 'Welche zwei Zeilen schreiben den falschen Gradienten?',
					instrument: { kind: 'lines', code: mulBackwardCode, max: 2 },
					localCheck: { kind: 'lines', expected: ['z5', 'z6'] }
				},
				{
					id: 'pruefFaelle',
					context: 'KI-Code · Multiplikation rückwärts',
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'Test', value: 'x · x' },
							{ label: 'x', value: '3' },
							{ label: 'x.grad', value: '6.0' },
							{ label: 'Status', value: 'grün' }
						]
					},
					ask: 'Welche Prüffälle decken den Fehler auf?',
					instrument: {
						kind: 'choice',
						layout: 'rows',
						labels: { zentral: 'Zentrale Differenz, h = 10^{−6}, a = 2, b = −3, frische Knoten' }
					}
				}
			]
		}
	},
	{
		task: aiAverageTask,
		format: 'plausible-but-wrong',
		level: 2,
		title: 'Zufallstreffer beim Durchschnitt',
		subtitle: 'Das Vorzeigebeispiel geht glatt auf, doch die Formel täuscht.',
		minutes: 8,
		prompt:
			'Die KI-Funktion soll den Durchschnitt aller Werte über einer Grenze liefern. Ohne Treffer soll None zurückkommen. Welche Aufrufe mit grenze = 5 decken einen Fehler auf? Wähle alle zutreffenden.',
		modelAnswer: pythonBlock(averageCode),
		passingExample: 'durchschnitt_ueber([10, 20, 30], 5) ergibt 20.0, wie erwartet.',
		counterexamplePrompt:
			'Finde eine Eingabe, bei der die Funktion ein falsches Ergebnis liefert, und gib das richtige Ergebnis daneben an.',
		explanationPrompt: 'Beschreibe die falsche Annahme der Funktion in einem Satz.',
		response: {
			answerKind: 'choice',
			multiple: true,
			options: options(
				['zehn-zwanzig-dreissig', '[10, 20, 30]'],
				['sechs-acht', '[6, 8]'],
				['eins-zehn-zwanzig', '[1, 10, 20]'],
				['eins-zwei', '[1, 2]']
			)
		},
		askConfidence: true,
		learningGoalIds: ['lz-ki-loesung-pruefen', 'lz-schleifenfehler-finden', 'lz-tests-schreiben'],
		sources: [
			taskSource('Aufgabe · KI-Durchschnitt prüfen', aiAverageTask),
			repoSource(
				'Fehlvorstellungen · Python-Einstieg',
				'pakete/kurse/python-einstieg/fehlvorstellungen.yaml'
			)
		],
		stage: {
			steps: [
				{
					id: 'zeile',
					context: 'KI-Code · Mittel aller Werte über grenze',
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'grenze', value: '5' },
							{ label: 'ohne Treffer', value: 'None' },
							{ label: 'mit [10, 20, 30]', value: '20.0' }
						]
					},
					ask: 'Welche Zeile liefert den falschen Durchschnitt?',
					instrument: { kind: 'lines', code: averageCode, max: 1 },
					localCheck: { kind: 'lines', expected: ['z7'] }
				},
				{
					id: 'aufrufe',
					context: 'KI-Code · Mittel aller Werte über grenze',
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'grenze', value: '5' },
							{ label: 'ohne Treffer', value: 'None' },
							{ label: 'mit [10, 20, 30]', value: '20.0' }
						]
					},
					ask: 'Welche Aufrufe decken einen Fehler auf?',
					instrument: { kind: 'choice', layout: 'grid' }
				}
			]
		}
	},
	{
		task: landscapeTask,
		format: 'contrast-lab',
		level: 2,
		title: 'Abstieg durch die steile Schlucht',
		subtitle: 'Eine Richtung fällt zehnmal steiler ab als die andere.',
		minutes: 12,
		prompt:
			'Zwei Verlustlandschaften, gleicher Start (1, 1), gleiches Minimum im Ursprung: f = x² + y² und g = x² + 10y². Am Start zeigt der negative Gradient bei f auf (−2, −2), bei g auf (−2, −20). Bei g wird y pro Schritt mit dem Faktor (1 − 20η) multipliziert. Wie verläuft y bei η = 0,085? Sag es voraus, bevor du die Kurve freischaltest.',
		response: {
			answerKind: 'choice',
			options: options(
				['monoton', 'y sinkt glatt gegen 0.'],
				['zickzack-abklingend', 'y springt um 0 hin und her, die Sprünge werden kleiner.'],
				['zickzack-divergent', 'y springt um 0 hin und her, die Sprünge werden größer.'],
				['ein-schritt', 'y ist nach einem Schritt genau 0.']
			)
		},
		askConfidence: true,
		learningGoalIds: ['lz-gradientenabstieg-anwenden', 'lz-lernrate-erklaeren'],
		sources: [taskSource('Aufgabe · Kontrast Gradientenrichtung', landscapeTask)],
		stage: {
			steps: [
				{
					id: 'vorhersage',
					context: formulaRef('gd-landschaften'),
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'Start', value: '(1, 1)' },
							{ label: 'Faktor für y', value: formulaRef('gd-landschaft-faktor') },
							{ label: 'η', value: '0,085' }
						]
					},
					ask: 'Wie verläuft y bei g?',
					more: 'Beide Minima im Ursprung. Negativer Gradient am Start: g (−2, −20), f (−2, −2).',
					spoken:
						'f gleich x Quadrat plus y Quadrat, g gleich x Quadrat plus zehn y Quadrat. Start bei eins, eins. Bei g wird y pro Schritt mit eins minus zwanzig eta multipliziert. Wie verläuft y bei eta gleich null Komma null acht fünf?',
					instrument: { kind: 'choice', layout: 'rows' }
				}
			]
		}
	},
	{
		task: priceChainTask,
		format: 'deep-dive',
		level: 3,
		title: 'Kettenreaktion an der Ladenkasse',
		subtitle: 'Ein Prozentpunkt mehr Aufschlag bewegt den Preis im Onlineshop.',
		minutes: 25,
		prompt:
			'Ein Onlineshop rechnet P = (E · (1 + s) + v) · (1 + m) mit Einkaufspreis E = 40 €, Aufschlag s = 0,5, Versand v = 5 € und Mehrwertsteuer m = 0,19. Zeichne zuerst den Rechengraphen auf Papier, rechne vorwärts und erkläre jeden Knoten laut. Dann rückwärts: Um wie viel Euro steigt P, wenn der Aufschlag um einen Prozentpunkt steigt und alles andere gleich bleibt? In der Gruppe: erst allein rechnen, dann die Graphen paarweise vergleichen, danach allein erneut antworten.',
		response: { answerKind: 'text' },
		askConfidence: true,
		learningGoalIds: ['lz-rechengraph-gradienten'],
		sources: [taskSource('Aufgabe · Preiskette', priceChainTask)],
		stage: {
			steps: [
				{
					id: 'papier',
					context: formulaRef('preis-kette'),
					facts: priceFacts,
					ask: 'Zeichne den Rechengraphen auf Papier und rechne ihn vorwärts.',
					more: `Erkläre jeden Knoten laut.\n\n${priceGroupCard}`,
					spoken:
						'P gleich, in Klammern, E mal eins plus s, plus v, Klammer zu, mal eins plus m. Zeichne den Rechengraphen auf Papier und rechne ihn vorwärts.',
					instrument: { kind: 'paper' }
				},
				{
					id: 'prozentpunkt',
					context: formulaRef('preis-kette'),
					facts: priceFacts,
					ask: 'Um wie viel Euro steigt P, wenn s um einen Prozentpunkt steigt?',
					spoken:
						'P gleich, in Klammern, E mal eins plus s, plus v, Klammer zu, mal eins plus m. Um wie viel Euro steigt P, wenn s um einen Prozentpunkt steigt?',
					more: `Alle anderen Werte bleiben gleich.\n\n${priceGroupCard}`,
					instrument: { kind: 'digits', decimals: 3, signed: true, unit: '€' }
				}
			]
		}
	},
	{
		task: graphSketchTask,
		format: 'deep-dive',
		level: 2,
		title: 'Schaltplan einer Gleichung',
		subtitle: 'Am Whiteboard zeigst du, wo sich ein Rechenpfad verzweigt.',
		minutes: 8,
		prompt:
			'Skizziere auf dem Whiteboard den Rechengraphen für e = a · b, d = e + c und L = d · d. Zeichne die Knoten, die Kantenrichtungen und beide Pfade von d zu L ein, bevor du die Skizze abgibst.',
		response: { answerKind: 'whiteboard' },
		askConfidence: true,
		learningGoalIds: ['lz-rechengraph-gradienten'],
		sources: [taskSource('Aufgabe · Addieren erklären', retrievalTask)],
		stage: {
			title: 'Schaltplan einer Gleichung',
			steps: [
				{
					id: 'skizze',
					context: formulaRef('backprop-hauptgraph'),
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'e', value: 'a · b' },
							{ label: 'd', value: 'e + c' },
							{ label: 'L', value: 'd · d' }
						]
					},
					ask: 'Zeichne den Rechengraphen mit Kantenrichtung und beiden Pfaden d → L.',
					spoken:
						'Zeichne den Rechengraphen für e gleich a mal b, d gleich e plus c, L gleich d mal d, mit Kantenrichtung und beiden Pfaden von d zu L.',
					instrument: { kind: 'sketch' }
				}
			]
		}
	},
	{
		task: probeTask,
		format: 'independent-probe',
		level: 3,
		title: 'Zwei Schritte ohne Lotsen',
		subtitle: 'Du rechnest den Abstieg allein zu Ende, ohne Tutor und Lernspur.',
		minutes: 6,
		prompt:
			'Diese Probe läuft ohne Tutor und ohne Zugriff auf deine Lernspur. L(w) = (2w − 4)², Start w₀ = 0, Lernrate η = 0,1. Welchen Wert hat w₂ nach zwei Schritten?',
		response: { answerKind: 'text' },
		askConfidence: true,
		learningGoalIds: ['lz-lernrate-erklaeren', 'lz-gradienten-vorhersagen-kalibrieren'],
		sources: [taskSource('Aufgabe · Lernrate auswählen', probeTask)],
		stage: {
			title: 'Zwei Schritte ohne Lotsen',
			steps: [
				{
					id: 'probe',
					context: formulaRef('gd-probe'),
					facts: {
						kind: 'cells',
						cells: [
							{ label: 'w₀', value: '0' },
							{ label: 'η', value: '0,1' }
						]
					},
					ask: 'Welchen Wert hat w₂?',
					more: 'Diese Probe läuft ohne Tutor und ohne Zugriff auf deine Lernspur.',
					spoken:
						'L von w gleich zwei w minus vier, zum Quadrat. w null gleich null, eta gleich null Komma eins. Welchen Wert hat w zwei?',
					instrument: { kind: 'digits', decimals: 2, signed: true }
				}
			]
		}
	}
];

// ---------------------------------------------------------------------------------------------
// Curated answers for MockTutorClient, kept apart from the material shown before submission.
// ---------------------------------------------------------------------------------------------

export const exerciseChecks: readonly ExerciseCheckFixture[] = [
	{
		task: learningRateTask,
		rules: [choiceRule(['pendeln'], 'Faktor 1 − 2η = −1: gleicher Abstand, kippendes Vorzeichen.')],
		feedback: 'Rechne den Faktor (1 − 2η) für η = 1 aus und wende ihn auf den Abstand 2 an.',
		evidence: [evidence('lz-lernrate-erklaeren', 'vorhersage')],
		optionFeedback: {
			pendeln:
				'Richtig. Der Abstand zum Minimum wird mit (1 − 2η) = −1 multipliziert. w springt zwischen 1 und 5.',
			halbieren:
				'Das ist Programm A. Bei B ist die Lernrate viermal so groß, also ändert sich der Faktor (1 − 2η).',
			treffer:
				'Ein Schritt genau ins Minimum passiert bei η = 0,5, wo der Faktor 0 ist. Bei η = 1 schießt w um denselben Abstand übers Ziel.',
			divergiert:
				'Das wäre η = 1,5 mit dem Faktor −2. Bei η = 1 wächst der Abstand nicht, er bleibt gleich.'
		}
	},
	{
		task: accumulatorTask,
		rules: [
			choiceRule(['a9-b4'], 'A sammelt 2 + 3 + 4. B setzt summe in jedem Durchlauf neu auf 0.')
		],
		feedback: 'Verfolge summe Zeile für Zeile und achte darauf, wo summe = 0 steht.',
		evidence: [evidence('lz-akkumulator-erklaeren', 'vorhersage')],
		optionFeedback: {
			'a9-b4':
				'Richtig. In B steht der Startwert in der Schleife. Übrig bleibt nur der letzte Durchlauf, 0 + 4.',
			'a9-b9':
				'Hier wirkt der Startwert in B wie einmal gesetzt. Er wird aber in jedem Durchlauf erneut auf 0 gesetzt.',
			'a4-b9': 'Die Ergebnisse sind vertauscht. Welches Programm setzt summe nur einmal auf 0?',
			spur: 'print steht nach der Schleife und läuft deshalb nur einmal. Die Zwischenwerte sind richtig verfolgt, werden aber nicht ausgegeben.'
		}
	},
	{
		task: retrievalTask,
		rules: [
			...textRule(
				['8'],
				'd steht an zwei Eingängen von L. Beide Beiträge von je 4 werden addiert.'
			),
			...textRule(
				['4'],
				'Ein Pfad stimmt. d steht aber an zwei Eingängen von L, und jeder liefert einen Beitrag.',
				true
			)
		],
		feedback:
			'Rückseite: L = d · d hat zwei Eingänge. Jeder liefert den anderen Faktor mal L.grad, also 4. Mit += ergibt das 8.',
		evidence: [evidence('lz-rechengraph-gradienten', 'anwendung')]
	},
	{
		task: aiBackwardTask,
		rules: [
			choiceRule(
				['ungleich', 'zentral'],
				'Beide Fälle haben verschiedene Faktoren. Der Code liefert (2, −3) statt (−3, 2), maximale Abweichung 5.'
			),
			choiceRule(['ungleich'], 'Dieser Fall entlarvt den Fehler. Ein zweiter auch.', true),
			choiceRule(
				['zentral'],
				'Die numerische Probe entlarvt den Fehler. Ein zweiter Fall auch.',
				true
			)
		],
		feedback:
			'Bei gleichen Faktoren sind „eigener Wert“ und „Wert des anderen“ dieselbe Zahl. Prüffälle brauchen zwei verschiedene Faktoren.',
		evidence: [evidence('lz-ki-backprop-pruefen', 'fehlerfund')],
		optionFeedback: {
			'x-mal-x':
				'Das ist genau der grüne Test. Bei x · x sind beide Faktoren gleich, die Vertauschung bleibt unsichtbar.',
			ungleich:
				'Deckt den Fehler auf. Richtig wäre a.grad = −3 und b.grad = 2, der Code liefert 2 und −3.',
			gleich: 'Auch hier sind beide Faktoren gleich. Der Fehler bleibt unsichtbar.',
			zentral:
				'Deckt den Fehler auf, und zwar ohne die richtige Lösung zu kennen. Das ist der Wert eines eigenen Prüfwerkzeugs.'
		}
	},
	{
		task: aiAverageTask,
		rules: [
			choiceRule(
				['eins-zehn-zwanzig', 'eins-zwei'],
				'Beide entlarven die Funktion: Sie teilt durch alle Werte und kennt kein None.'
			),
			choiceRule(
				['eins-zehn-zwanzig'],
				'Dieser Aufruf entlarvt den Nenner. Ein zweiter Fehler fehlt noch.',
				true
			),
			choiceRule(
				['eins-zwei'],
				'Dieser Aufruf entlarvt den fehlenden None-Fall. Der Nenner ist ein zweiter Fehler.',
				true
			)
		],
		feedback:
			'Die Beispiele der KI liegen alle über der Grenze. Ein Fehler zeigt sich erst, wenn Werte darunter liegen.',
		evidence: [evidence('lz-ki-loesung-pruefen', 'fehlerfund')],
		optionFeedback: {
			'zehn-zwanzig-dreissig':
				'Das ist das Beispiel der KI. Alle Werte liegen über 5, deshalb stimmt der falsche Nenner zufällig.',
			'sechs-acht': 'Auch hier liegen alle Werte über der Grenze. Der Fehler bleibt verborgen.',
			'eins-zehn-zwanzig': 'Deckt den Fehler auf: 30 / 3 = 10.0 statt 30 / 2 = 15.0.',
			'eins-zwei': 'Deckt den Fehler auf: Ohne Treffer kommt 0.0 statt None zurück.'
		}
	},
	{
		task: landscapeTask,
		rules: [
			choiceRule(
				['zickzack-abklingend'],
				'Faktor 1 − 20 · 0,085 = −0,7: Das Vorzeichen kippt, der Betrag schrumpft.'
			)
		],
		feedback: 'Rechne den Faktor 1 − 20η aus und schau auf Vorzeichen und Betrag.',
		evidence: [evidence('lz-lernrate-erklaeren', 'vorhersage')],
		optionFeedback: {
			monoton:
				'Das gilt für η = 0,04 mit dem Faktor 0,2. Bei 0,085 ist der Faktor negativ, y wechselt das Vorzeichen.',
			'zickzack-abklingend':
				'Richtig. Der Faktor −0,7 kippt das Vorzeichen, der Betrag schrumpft. Die flache x-Richtung läuft mit 0,83 glatt.',
			'zickzack-divergent':
				'Das beginnt erst oberhalb von η = 0,1. Bei η = 0,105 ist der Faktor −1,1, dann wachsen die Sprünge.',
			'ein-schritt': 'Das passiert bei η = 0,05, wo der Faktor genau 0 ist.'
		}
	},
	{
		task: priceChainTask,
		rules: [
			...textRule(
				['0,476', '0.476', '0,476 €', '0.476 €'],
				'∂P/∂s = E · (1 + m) = 47,6 € je Einheit von s. Ein Prozentpunkt ist 0,01, also 0,476 €.'
			),
			...textRule(['0,48', '0.48', '0,48 €'], 'Gerundet richtig. Exakt sind es 0,476 €.', true),
			...textRule(
				['47,6', '47.6', '47,6 €'],
				'Das ist ∂P/∂s je ganzer Einheit von s. Ein Prozentpunkt ist aber 0,01.',
				true
			)
		],
		feedback:
			'Geh rückwärts vom Endpreis: Wie stark hängt P von E · (1 + s) ab, und wie stark hängt das von s ab?',
		evidence: [evidence('lz-rechengraph-gradienten', 'transfer')]
	},
	{
		task: graphSketchTask,
		rules: [],
		feedback:
			'Der Demo-Modus kann die Skizze nicht automatisch bewerten. Prüfe selbst: Sind e = a · b, d = e + c und beide Pfade von d zu L eingezeichnet? Für gezielte Rückfragen übergib die Skizze im Tutor.',
		evidence: []
	},
	{
		task: probeTask,
		rules: [
			...textRule(['1,92', '1.92'], 'w₁ = 1,6 und w₂ = 1,92.'),
			...textRule(['1,6', '1.6'], 'Das ist w₁. Ein Schritt fehlt noch.', true)
		],
		feedback: 'Die Probe ist gespeichert. Der Gradient ist 4 · (2w − 4).',
		evidence: [evidence('lz-lernrate-erklaeren', 'anwendung')]
	}
];

/** Resolves exercise deep links, including the original whiteboard task ID. */
export function exerciseForTask(taskId: string | null): EditorialExercise | undefined {
	const id = taskId === 'a-bp-rechengraph-skizzieren' ? graphSketchTask.taskId : taskId;
	return exercises.find((entry) => entry.task.taskId === id);
}
