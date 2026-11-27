import type { EvidenceKind, TaskRef } from '../api/types.js';
import type { MockFixtures } from '../api/mock.js';
import { formulaRef } from '../math/editorial-formulas.js';
import { repoSource } from './sources.js';
import type { ExerciseCheckRule, ExerciseItem, StageFacts } from './types.js';

// 1 = short entry, 2 = careful check, 3 = deep dive or independent probe.
export type EditorialExercise = ExerciseItem & { level: 1 | 2 | 3; subtitle: string };

// Choice exercises may explain individual distractors after submission.
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
const accumulatorFeedback =
	'Die Ausgaben stimmen. Prüfe für dich, warum B die Summe in jedem Durchlauf zurücksetzt.';
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

// Facts of the price chain (textredaktion-v2.md §1.7), shared by both steps.
const priceFacts = {
	kind: 'cells',
	cells: [
		{ label: 'E Einkauf', value: '40 €' },
		{ label: 's Aufschlag', value: '0,5' },
		{ label: 'v Versand', value: '5 €' },
		{ label: 'm MwSt.', value: '0,19' }
	]
} as const satisfies StageFacts;

const pythonBlock = (code: string) => `\`\`\`python\n${code}\n\`\`\``;

export const exercises: readonly EditorialExercise[] = [
	{
		task: learningRateTask,
		format: 'quick-challenge',
		level: 1,
		title: 'Wettlauf zum tiefsten Punkt',
		subtitle: 'Lernrate',
		minutes: 5,
		prompt:
			'f(w) = (w − 3)², Start bei w = 5. Programm A nutzt Lernrate 0,25 und gibt 4, 3,5, 3,25 aus. Programm B nutzt Lernrate 1. Welche drei Werte gibt B nacheinander aus?',
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
							{ key: 'A', label: 'Lernrate 0,25', value: '4 · 3,5 · 3,25' },
							{ key: 'B', label: 'Lernrate 1', value: '? · ? · ?' }
						]
					},
					ask: 'Welche drei Werte gibt B nacheinander aus?',
					spoken:
						'f von w gleich w minus drei, zum Quadrat. Start bei w gleich fünf. A mit Lernrate null Komma zwei fünf gibt vier, drei Komma fünf, drei Komma zwei fünf aus. Welche drei Werte gibt B mit Lernrate eins nacheinander aus?',
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
		subtitle: 'Python-Schleife',
		minutes: 5,
		prompt:
			'Programm A:\n\n```python\nsumme = 0\nfor x in [2, 3, 4]:\n    summe = summe + x\nprint(summe)\n```\n\nProgramm B:\n\n```python\nfor x in [2, 3, 4]:\n    summe = 0\n    summe = summe + x\nprint(summe)\n```\n\nWas geben A und B am Ende aus?',
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
			correctFeedback: accumulatorFeedback,
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
					ask: 'Was geben A und B am Ende aus?',
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
		subtitle: 'Backprop',
		minutes: 3,
		prompt: 'L = d · d mit d = 4 und L.grad = 1. Wie groß ist d.grad?',
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
					ask: 'Wie groß ist d.grad?',
					spoken:
						'L gleich d mal d. d gleich vier, L Punkt grad gleich eins. Wie groß ist d Punkt grad?',
					instrument: { kind: 'digits', decimals: 0, signed: true }
				}
			],
			review: {
				id: 'rueckseite',
				context: formulaRef('backprop-quadrat'),
				spoken: 'L gleich d mal d. Hattest du beide Pfade zu L auf dem Schirm?',
				ask: 'Hattest du beide Pfade zu L auf dem Schirm?',
				instrument: { kind: 'spectrum' }
			}
		}
	},
	{
		task: aiBackwardTask,
		format: 'plausible-but-wrong',
		level: 2,
		title: 'Der blinde Fleck im Prüfstand',
		subtitle: 'KI-Code prüfen',
		minutes: 8,
		prompt:
			'Ein Sprachmodell hat den Rückwärtsschritt für die Multiplikation geschrieben. Der Test mit x · x ist grün. Welche Tests decken den Fehler auf?',
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
					ask: 'Welche zwei Zeilen berechnen den Gradienten falsch?',
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
					ask: 'Welche Tests decken den Fehler auf?',
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
		subtitle: 'Python-Test',
		minutes: 8,
		prompt:
			'Die KI-Funktion soll den Durchschnitt aller Werte über einer Grenze liefern – ohne Treffer None. Bei welchen Listen mit grenze = 5 rechnet sie falsch?',
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
					ask: 'In welcher Zeile steckt der Rechenfehler?',
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
					ask: 'Bei welchen Listen rechnet die Funktion falsch?',
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
		subtitle: 'Zwei Achsen',
		minutes: 12,
		prompt:
			'Zwei Verlustlandschaften mit Start bei (1, 1): f = x² + y² und g = x² + 10y². Bei g wird y pro Schritt mit (1 − 20 · Lernrate) multipliziert. Wie bewegt sich y bei Lernrate 0,085?',
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
							{ label: 'Lernrate', value: '0,085' }
						]
					},
					ask: 'Wie bewegt sich y bei g mit jedem Schritt?',
					more: 'Beide Minima im Ursprung. Negativer Gradient am Start: g (−2, −20), f (−2, −2).',
					spoken:
						'f gleich x Quadrat plus y Quadrat, g gleich x Quadrat plus zehn y Quadrat. Start bei eins, eins. Bei g wird y pro Schritt mit eins minus zwanzig mal Lernrate multipliziert. Wie bewegt sich y bei Lernrate null Komma null acht fünf?',
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
		subtitle: 'Kettenregel',
		minutes: 25,
		prompt:
			'Ein Onlineshop rechnet P = (E · (1 + s) + v) · (1 + m) mit E = 40 €, Aufschlag s = 0,5, Versand v = 5 € und MwSt. m = 0,19. Rechne P erst vorwärts auf Papier aus. Dann rückwärts: Um wie viel Euro steigt P, wenn s um einen Prozentpunkt steigt?',
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
					ask: 'Skizziere die Rechnung auf Papier und rechne P aus.',
					spoken:
						'P gleich, in Klammern, E mal eins plus s, plus v, Klammer zu, mal eins plus m. Skizziere die Rechnung auf Papier und rechne P aus.',
					instrument: { kind: 'paper' }
				},
				{
					id: 'prozentpunkt',
					context: formulaRef('preis-kette'),
					facts: priceFacts,
					ask: 'Um wie viel Euro steigt P, wenn s um einen Prozentpunkt steigt?',
					spoken:
						'P gleich, in Klammern, E mal eins plus s, plus v, Klammer zu, mal eins plus m. Um wie viel Euro steigt P, wenn s um einen Prozentpunkt steigt?',
					more: 'Alle anderen Werte bleiben gleich.',
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
		subtitle: 'Rechengraph',
		minutes: 8,
		prompt:
			'Zeichne den Rechengraphen für e = a · b, d = e + c und L = d · d mit Pfeilrichtung und beiden Pfaden von d zu L.',
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
					ask: 'Zeichne den Rechengraphen mit Pfeilrichtung und beiden Pfaden d → L.',
					spoken:
						'Zeichne den Rechengraphen für e gleich a mal b, d gleich e plus c, L gleich d mal d, mit Pfeilrichtung und beiden Pfaden von d zu L.',
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
		subtitle: 'Ohne Hilfe',
		minutes: 6,
		prompt: 'L(w) = (2w − 4)², Start w₀ = 0, Lernrate 0,1. Wie groß ist w₂ nach zwei Schritten?',
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
							{ label: 'Lernrate', value: '0,1' }
						]
					},
					ask: 'Wie groß ist w₂ nach zwei Schritten?',
					spoken:
						'L von w gleich zwei w minus vier, zum Quadrat. w null gleich null, Lernrate null Komma eins. Wie groß ist w zwei nach zwei Schritten?',
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
		rules: [
			choiceRule(
				['pendeln'],
				'Faktor 1 − 2 · Lernrate = −1: gleicher Abstand, kippendes Vorzeichen.'
			)
		],
		feedback:
			'Rechne den Faktor (1 − 2 · Lernrate) für Lernrate 1 aus und wende ihn auf den Abstand 2 an.',
		evidence: [evidence('lz-lernrate-erklaeren', 'vorhersage')],
		optionFeedback: {
			pendeln: 'Der Abstand zum Minimum wird mit −1 multipliziert – w springt zwischen 1 und 5.',
			halbieren:
				'Das ist Programm A. Bei B ist die Lernrate viermal so groß, also kippt der Faktor auf −1.',
			treffer:
				'Direkt ins Minimum triffst du bei Lernrate 0,5 (Faktor 0). Bei Lernrate 1 schießt w um denselben Abstand übers Ziel.',
			divergiert:
				'Das wäre Lernrate 1,5 mit Faktor −2. Bei Lernrate 1 bleibt der Abstand gleich groß.'
		}
	},
	{
		task: accumulatorTask,
		rules: [choiceRule(['a9-b4'], accumulatorFeedback)],
		feedback: 'Verfolge summe Zeile für Zeile und schau genau hin, wo summe = 0 steht.',
		evidence: [evidence('lz-akkumulator-erklaeren', 'vorhersage')],
		optionFeedback: {
			'a9-b4':
				'In B steht summe = 0 mitten in der Schleife – übrig bleibt nur der letzte Durchlauf: 0 + 4.',
			'a9-b9':
				'In B wird summe nicht einmal, sondern in jedem Durchlauf wieder auf 0 zurückgesetzt.',
			'a4-b9': 'Genau andersherum: Welches Programm setzt summe nur einmal vor der Schleife auf 0?',
			spur: 'print steht hinter der Schleife und läuft deshalb nur einmal am Ende.'
		}
	},
	{
		task: retrievalTask,
		rules: [
			...textRule(
				['8'],
				'd steht an beiden Eingängen von L – beide Beiträge von je 4 addieren sich zu 8.'
			),
			{
				accepted: { kind: 'text', text: '4' },
				result: 'falsch',
				feedback: 'Ein Pfad stimmt schon. Über wie viele Eingänge geht d in L ein?'
			}
		],
		feedback:
			'Noch nicht. Schau, an wie vielen Eingängen von L das d steht – und was += mit jedem Beitrag macht.',
		evidence: [
			{ ...evidence('lz-rechengraph-gradienten', 'anwendung'), evidenceScope: 'teilaspekt' }
		]
	},
	{
		task: aiBackwardTask,
		rules: [
			choiceRule(
				['ungleich', 'zentral'],
				'Beide Tests nutzen verschiedene Faktoren: Der Code liefert (2, −3) statt (−3, 2).'
			),
			choiceRule(['ungleich'], 'Dieser Test deckt den Fehler auf – ein zweiter ebenfalls.', true),
			choiceRule(
				['zentral'],
				'Die numerische Probe deckt den Fehler auf – ein zweiter Test ebenfalls.',
				true
			)
		],
		feedback:
			'Bei gleichen Faktoren liefern „eigener Wert“ und „anderer Faktor“ dieselbe Zahl. Du brauchst zwei verschiedene Zahlen.',
		evidence: [evidence('lz-ki-backprop-pruefen', 'fehlerfund')],
		optionFeedback: {
			'x-mal-x':
				'Genau dieser Test war grün: Bei x · x sind beide Faktoren gleich, die Vertauschung fällt nicht auf.',
			ungleich:
				'Deckt den Fehler auf: Richtig ist a.grad = −3 und b.grad = 2, der Code liefert 2 und −3.',
			gleich: 'Auch hier sind beide Faktoren gleich (2 und 2) – der Fehler bleibt unsichtbar.',
			zentral: 'Deckt den Fehler auf, selbst ohne die Ableitungsformel im Kopf zu haben.'
		}
	},
	{
		task: aiAverageTask,
		rules: [
			choiceRule(
				['eins-zehn-zwanzig', 'eins-zwei'],
				'Beide knacken die Funktion: Sie teilt durch alle Elemente und fängt leere Treffer nicht ab.'
			),
			choiceRule(
				['eins-zehn-zwanzig'],
				'Deckt den falschen Nenner auf – ein zweiter Fehler steckt noch drin.',
				true
			),
			choiceRule(
				['eins-zwei'],
				'Deckt das fehlende None auf – beim Nenner steckt noch ein zweiter Fehler.',
				true
			)
		],
		feedback:
			'Solange alle Werte über 5 liegen, fällt der falsche Nenner nicht auf. Nimm Werte kleiner oder gleich 5 dazu.',
		evidence: [evidence('lz-ki-loesung-pruefen', 'fehlerfund')],
		optionFeedback: {
			'zehn-zwanzig-dreissig':
				'Alle drei Werte liegen über 5 – deshalb stimmt len(werte) hier zufällig.',
			'sechs-acht': 'Auch hier liegen beide Werte über 5 – der falsche Nenner fällt nicht auf.',
			'eins-zehn-zwanzig':
				'Deckt den Fehler auf: Die Funktion rechnet 30 / 3 = 10.0 statt 30 / 2 = 15.0.',
			'eins-zwei': 'Deckt den Fehler auf: Ohne Treffer gibt sie 0.0 statt None zurück.'
		}
	},
	{
		task: landscapeTask,
		rules: [
			choiceRule(
				['zickzack-abklingend'],
				'Faktor 1 − 20 · 0,085 = −0,7: Vorzeichen wechselt, Abstand schrumpft.'
			)
		],
		feedback: 'Rechne 1 − 20 · 0,085 aus und schau auf Vorzeichen und Betrag.',
		evidence: [evidence('lz-lernrate-erklaeren', 'vorhersage')],
		optionFeedback: {
			monoton:
				'Glatt ohne Vorzeichenwechsel läuft y nur unterhalb von Lernrate 0,05. Bei 0,085 ist der Faktor −0,7.',
			'zickzack-abklingend':
				'Faktor −0,7 heißt: jede Runde auf die andere Seite, aber näher an 0. In x-Richtung geht es mit Faktor 0,83 ruhig voran.',
			'zickzack-divergent':
				'Aufschaukeln beginnt erst über Lernrate 0,1, wenn der Faktor kleiner als −1 wird.',
			'ein-schritt': 'Genau bei 0 landest du nur mit Lernrate 0,05 (Faktor 0).'
		}
	},
	{
		task: priceChainTask,
		rules: [
			...textRule(
				['0,476', '0.476', '0,476 €', '0.476 €'],
				'∂P/∂s = E · (1 + m) = 47,6 € pro ganzer Einheit – ein Prozentpunkt (0,01) macht 0,476 €.'
			),
			...textRule(['0,48', '0.48', '0,48 €'], 'Gerundet dran – exakt sind es 0,476 €.', true),
			...textRule(
				['47,6', '47.6', '47,6 €'],
				'Fast: 47,6 € gilt für +1,00 beim Aufschlag, gefragt ist ein Prozentpunkt (+0,01).',
				true
			)
		],
		feedback:
			'Geh vom Endpreis rückwärts: Wie stark wirkt E · (1 + s) auf P, und wie stark wirkt s darauf?',
		evidence: [
			{ ...evidence('lz-rechengraph-gradienten', 'transfer'), evidenceScope: 'teilaspekt' }
		]
	},
	{
		task: graphSketchTask,
		rules: [],
		feedback:
			'Prüfe selbst: Sind e = a · b, d = e + c und beide Pfade von d zu L eingezeichnet? Wenn du Feedback willst, schick die Skizze an den Tutor.',
		evidence: []
	},
	{
		task: probeTask,
		rules: [
			...textRule(['1,92', '1.92'], 'Nach Schritt 1 ist w₁ = 1,6, nach Schritt 2 dann w₂ = 1,92.'),
			...textRule(
				['1,6', '1.6'],
				'Das ist w₁ nach dem ersten Schritt – rechne noch einen zweiten.',
				true
			)
		],
		feedback: 'Der Gradient ist 4 · (2w − 4). Rechne damit erst w₁ und dann w₂ aus.',
		evidence: [evidence('lz-lernrate-erklaeren', 'anwendung')]
	}
];

/** Resolves exercise deep links, including the original whiteboard task ID. */
export function exerciseForTask(taskId: string | null): EditorialExercise | undefined {
	const id = taskId === 'a-bp-rechengraph-skizzieren' ? graphSketchTask.taskId : taskId;
	return exercises.find((entry) => entry.task.taskId === id);
}
